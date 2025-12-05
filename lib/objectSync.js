/**
 * ObjectSync - Manages shared 3D object state synchronization
 * Handles object creation, updates, deletion, and persistence per room
 */

class ObjectSync {
  constructor() {
    // Map of roomId -> Map of objectId -> objectState
    this.rooms = new Map();
    this.objectIdCounter = 0;
  }

  /**
   * Initialize a room for object syncing
   */
  initRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
      console.log(`ObjectSync: Initialized room ${roomId}`);
    }
  }

  /**
   * Create a new object in a room
   */
  createObject(roomId, objectData) {
    this.initRoom(roomId);

    const objectId = this.generateObjectId();
    const timestamp = Date.now();

    const objectState = {
      id: objectId,
      type: objectData.type || "cube",
      position: objectData.position || [0, 1, -2],
      rotation: objectData.rotation || [0, 0, 0],
      scale: objectData.scale || [1, 1, 1],
      color: objectData.color || 0x4caf50,
      createdBy: objectData.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.rooms.get(roomId).set(objectId, objectState);
    console.log(`ObjectSync: Created object ${objectId} in room ${roomId}`);

    return objectState;
  }

  /**
   * Update an existing object's state
   */
  updateObject(roomId, objectId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    const object = room.get(objectId);
    if (!object) {
      throw new Error(`Object ${objectId} does not exist in room ${roomId}`);
    }

    // Update allowed fields
    if (updates.position) object.position = updates.position;
    if (updates.rotation) object.rotation = updates.rotation;
    if (updates.scale) object.scale = updates.scale;
    if (updates.color !== undefined) object.color = updates.color;

    object.updatedAt = Date.now();

    console.log(`ObjectSync: Updated object ${objectId} in room ${roomId}`);
    return object;
  }

  /**
   * Delete an object from a room
   */
  deleteObject(roomId, objectId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    const deleted = room.delete(objectId);
    if (deleted) {
      console.log(`ObjectSync: Deleted object ${objectId} from room ${roomId}`);
    }
    return deleted;
  }

  /**
   * Get all objects in a room
   */
  getRoomObjects(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }

    return Array.from(room.values());
  }

  /**
   * Get a specific object by ID
   */
  getObject(roomId, objectId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    return room.get(objectId) || null;
  }

  /**
   * Clear all objects in a room
   */
  clearRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.clear();
      console.log(`ObjectSync: Cleared all objects in room ${roomId}`);
    }
  }

  /**
   * Delete a room and all its objects
   */
  deleteRoom(roomId) {
    const deleted = this.rooms.delete(roomId);
    if (deleted) {
      console.log(`ObjectSync: Deleted room ${roomId}`);
    }
    return deleted;
  }

  /**
   * Generate a unique object ID
   */
  generateObjectId() {
    return `obj_${++this.objectIdCounter}_${Date.now()}`;
  }

  /**
   * Get statistics about the sync state
   */
  getStats() {
    const stats = {
      totalRooms: this.rooms.size,
      rooms: [],
    };

    this.rooms.forEach((room, roomId) => {
      stats.rooms.push({
        roomId: roomId,
        objectCount: room.size,
      });
    });

    return stats;
  }
}

module.exports = ObjectSync;
