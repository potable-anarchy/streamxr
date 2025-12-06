/**
 * ObjectSync - Manages shared 3D object state synchronization
 * Handles object creation, updates, deletion, and persistence per room
 */

class ObjectSync {
  constructor() {
    // Map of roomId -> Map of objectId -> objectState
    this.rooms = new Map();
    this.objectIdCounter = 0;

    // Ownership tracking: objectId -> { userId, grabbedAt, timeout }
    this.objectOwnership = new Map();

    // Ownership timeout in milliseconds (5 seconds)
    this.OWNERSHIP_TIMEOUT = 5000;
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
      ownedBy: null, // Currently grabbed by which user
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

  /**
   * Attempt to grab an object (acquire ownership)
   * Returns true if successful, false if already owned by someone else
   */
  grabObject(roomId, objectId, userId) {
    const object = this.getObject(roomId, objectId);
    if (!object) {
      throw new Error(`Object ${objectId} does not exist in room ${roomId}`);
    }

    // Check if already owned by someone else
    if (object.ownedBy && object.ownedBy !== userId) {
      return { success: false, ownedBy: object.ownedBy };
    }

    // Grant ownership
    object.ownedBy = userId;
    object.updatedAt = Date.now();

    // Clear existing timeout if any
    const ownershipData = this.objectOwnership.get(objectId);
    if (ownershipData && ownershipData.timeout) {
      clearTimeout(ownershipData.timeout);
    }

    // Set timeout to auto-release after 5 seconds of inactivity
    const timeout = setTimeout(() => {
      this.releaseObject(roomId, objectId, userId);
    }, this.OWNERSHIP_TIMEOUT);

    this.objectOwnership.set(objectId, {
      userId,
      grabbedAt: Date.now(),
      timeout,
    });

    console.log(
      `ObjectSync: User ${userId} grabbed object ${objectId} in room ${roomId}`
    );
    return { success: true, object };
  }

  /**
   * Release ownership of an object
   */
  releaseObject(roomId, objectId, userId) {
    const object = this.getObject(roomId, objectId);
    if (!object) {
      return false;
    }

    // Only release if the user actually owns it
    if (object.ownedBy !== userId) {
      return false;
    }

    object.ownedBy = null;
    object.updatedAt = Date.now();

    // Clear timeout
    const ownershipData = this.objectOwnership.get(objectId);
    if (ownershipData && ownershipData.timeout) {
      clearTimeout(ownershipData.timeout);
    }

    this.objectOwnership.delete(objectId);

    console.log(
      `ObjectSync: User ${userId} released object ${objectId} in room ${roomId}`
    );
    return true;
  }

  /**
   * Refresh ownership timeout (reset the 5-second timer)
   * Called when user moves the object
   */
  refreshOwnership(objectId, userId) {
    const ownershipData = this.objectOwnership.get(objectId);
    if (!ownershipData || ownershipData.userId !== userId) {
      return false;
    }

    // Clear old timeout
    if (ownershipData.timeout) {
      clearTimeout(ownershipData.timeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      // Find the room this object belongs to
      for (const [roomId, room] of this.rooms.entries()) {
        if (room.has(objectId)) {
          this.releaseObject(roomId, objectId, userId);
          break;
        }
      }
    }, this.OWNERSHIP_TIMEOUT);

    ownershipData.timeout = timeout;
    return true;
  }

  /**
   * Check if an object is currently owned by a user
   */
  isObjectOwned(roomId, objectId) {
    const object = this.getObject(roomId, objectId);
    return object ? object.ownedBy : null;
  }

  /**
   * Release all objects owned by a user (called when user disconnects)
   */
  releaseAllUserObjects(userId) {
    let releasedCount = 0;

    this.rooms.forEach((room, roomId) => {
      room.forEach((object, objectId) => {
        if (object.ownedBy === userId) {
          this.releaseObject(roomId, objectId, userId);
          releasedCount++;
        }
      });
    });

    console.log(
      `ObjectSync: Released ${releasedCount} objects owned by user ${userId}`
    );
    return releasedCount;
  }
}

module.exports = ObjectSync;
