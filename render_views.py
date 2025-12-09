#!/usr/bin/env python3
"""
Render a GLB file from multiple viewpoints to prepare for NeRF training
"""

import json
import os
from pathlib import Path

import numpy as np
import pyrender
import trimesh
from PIL import Image
from pygltflib import GLTF2


def look_at(eye, target, up):
    """Create a look-at camera matrix"""
    f = target - eye
    f = f / np.linalg.norm(f)

    s = np.cross(f, up)
    s = s / np.linalg.norm(s)

    u = np.cross(s, f)

    m = np.eye(4)
    m[:3, 0] = s
    m[:3, 1] = u
    m[:3, 2] = -f
    m[:3, 3] = eye

    return m


def load_glb_with_pygltflib(glb_path):
    """Load GLB using pygltflib and create a trimesh object with proper data"""
    gltf = GLTF2().load(glb_path)

    # Get the first mesh primitive
    mesh = gltf.meshes[0]
    primitive = mesh.primitives[0]

    # Get accessors
    pos_accessor = gltf.accessors[primitive.attributes.POSITION]

    # Read binary data
    binary_blob = gltf.binary_blob()

    pos_buffer_view = (
        gltf.bufferViews[pos_accessor.bufferView]
        if pos_accessor.bufferView is not None
        else None
    )

    if pos_buffer_view:
        pos_data = binary_blob[
            pos_buffer_view.byteOffset : pos_buffer_view.byteOffset
            + pos_buffer_view.byteLength
        ]
        vertices = np.frombuffer(pos_data, dtype=np.float32).reshape(-1, 3)
    else:
        # Sparse accessor or no bufferView - use bounds as fallback
        vertices = np.array([[0, 0, 0]], dtype=np.float32)

    # Extract indices if present
    if primitive.indices is not None:
        idx_accessor = gltf.accessors[primitive.indices]
        if idx_accessor.bufferView is not None:
            idx_buffer_view = gltf.bufferViews[idx_accessor.bufferView]
            idx_data = binary_blob[
                idx_buffer_view.byteOffset : idx_buffer_view.byteOffset
                + idx_buffer_view.byteLength
            ]

            # componentType 5123 = unsigned short, 5125 = unsigned int
            if idx_accessor.componentType == 5123:
                indices = np.frombuffer(idx_data, dtype=np.uint16).reshape(-1, 3)
            else:
                indices = np.frombuffer(idx_data, dtype=np.uint32).reshape(-1, 3)
        else:
            # No bufferView - create sequential
            indices = np.arange(len(vertices)).reshape(-1, 3)
    else:
        # No indices - create sequential
        indices = np.arange(len(vertices)).reshape(-1, 3)

    print(f"Loaded mesh: {len(vertices)} vertices, {len(indices)} faces")
    print(f"Bounds: min={vertices.min(axis=0)}, max={vertices.max(axis=0)}")

    # Create trimesh
    mesh = trimesh.Trimesh(vertices=vertices, faces=indices)

    return mesh


def render_glb_views(glb_path, output_dir, num_views=100, resolution=(800, 800)):
    """
    Render a GLB file from multiple camera viewpoints

    Args:
        glb_path: Path to the GLB file
        output_dir: Directory to save rendered images
        num_views: Number of camera viewpoints (default 100)
        resolution: Image resolution (width, height)
    """
    # Create output directory
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading GLB from {glb_path}...")

    # Load using pygltflib to get proper vertex data
    mesh = load_glb_with_pygltflib(glb_path)

    # Convert to pyrender scene
    scene = pyrender.Scene()

    # Add mesh to scene
    mesh_node = pyrender.Mesh.from_trimesh(mesh)
    scene.add(mesh_node)

    # Add lighting
    light = pyrender.DirectionalLight(color=np.ones(3), intensity=4.0)
    scene.add(
        light, pose=np.array([[1, 0, 0, 2], [0, 1, 0, 2], [0, 0, 1, 2], [0, 0, 0, 1]])
    )

    # Add fill light from opposite side
    fill_light = pyrender.DirectionalLight(color=np.ones(3), intensity=1.5)
    scene.add(
        fill_light,
        pose=np.array([[1, 0, 0, -2], [0, 1, 0, -2], [0, 0, 1, 1], [0, 0, 0, 1]]),
    )

    # Create camera
    camera = pyrender.PerspectiveCamera(yfov=np.pi / 3.0)

    # Create renderer
    renderer = pyrender.OffscreenRenderer(resolution[0], resolution[1])

    # Calculate camera positions on a sphere around the object
    print(f"Rendering {num_views} views...")

    # Get bounding box to determine camera distance
    bounds = mesh.bounds
    center = (bounds[0] + bounds[1]) / 2
    size = np.linalg.norm(bounds[1] - bounds[0])
    camera_distance = size * 2.0  # Distance from object

    print(
        f"Object center: {center}, size: {size:.2f}, camera distance: {camera_distance:.2f}"
    )

    transforms = []

    for i in range(num_views):
        # Spherical coordinates - orbit around the object
        theta = 2 * np.pi * i / num_views  # Azimuth (around Z axis)
        phi = np.pi / 4 + (np.pi / 8) * np.sin(3 * np.pi * i / num_views)  # Elevation

        # Convert to Cartesian coordinates
        x = camera_distance * np.sin(phi) * np.cos(theta)
        y = camera_distance * np.sin(phi) * np.sin(theta)
        z = camera_distance * np.cos(phi)

        # Camera position
        camera_pos = center + np.array([x, y, z])

        # Create look-at matrix
        up_vector = np.array([0, 0, 1])
        camera_pose = look_at(camera_pos, center, up_vector)

        # Add camera to scene
        camera_node = scene.add(camera, pose=camera_pose)

        # Render the scene
        color, depth = renderer.render(scene)

        # Save the image
        img = Image.fromarray(color)
        img_path = output_dir / f"image_{i:04d}.png"
        img.save(img_path)

        # Save transform for nerfstudio
        # Convert to nerfstudio format (camera-to-world matrix)
        transform = {
            "file_path": f"./image_{i:04d}.png",
            "transform_matrix": camera_pose.tolist(),
        }
        transforms.append(transform)

        # Remove camera for next iteration
        scene.remove_node(camera_node)

        if (i + 1) % 10 == 0:
            print(f"  Rendered {i + 1}/{num_views} views")

    # Save transforms.json for nerfstudio
    transforms_data = {"camera_angle_x": np.pi / 3.0, "frames": transforms}

    transforms_path = output_dir / "transforms.json"
    with open(transforms_path, "w") as f:
        json.dump(transforms_data, f, indent=2)

    print(f"✓ Saved {num_views} rendered views to {output_dir}")
    print(f"✓ Saved transforms.json to {transforms_path}")

    # Cleanup
    renderer.delete()


if __name__ == "__main__":
    glb_path = "public/models/helmet/high.glb"
    output_dir = "public/models/helmet/renders"

    render_glb_views(glb_path, output_dir, num_views=100)
