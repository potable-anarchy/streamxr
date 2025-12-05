class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.userPositions = new Map();
    this.defaultRoom = "default";
  }

  addUser(userId, ws, room = this.defaultRoom) {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }

    this.rooms.get(room).add(userId);

    this.userPositions.set(userId, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      color: this.generateRandomColor(),
      timestamp: Date.now(),
    });

    console.log(
      `User ${userId} joined room ${room}. Room size: ${this.rooms.get(room).size}`,
    );

    return {
      room,
      users: Array.from(this.rooms.get(room)).filter((id) => id !== userId),
    };
  }

  removeUser(userId) {
    let userRoom = null;

    for (const [room, users] of this.rooms.entries()) {
      if (users.has(userId)) {
        users.delete(userId);
        userRoom = room;

        if (users.size === 0) {
          this.rooms.delete(room);
        }
        break;
      }
    }

    this.userPositions.delete(userId);

    console.log(
      `User ${userId} left room ${userRoom}. Remaining users: ${userRoom ? this.rooms.get(userRoom)?.size || 0 : 0}`,
    );

    return userRoom;
  }

  updateUserPosition(userId, positionData) {
    const userData = this.userPositions.get(userId);
    if (!userData) {
      console.warn(`User ${userId} not found for position update`);
      return false;
    }

    if (positionData.position) userData.position = positionData.position;
    if (positionData.rotation) userData.rotation = positionData.rotation;
    if (positionData.quaternion) userData.quaternion = positionData.quaternion;
    userData.timestamp = Date.now();

    return true;
  }

  getUserPosition(userId) {
    return this.userPositions.get(userId);
  }

  getRoomUsers(room = this.defaultRoom) {
    return Array.from(this.rooms.get(room) || []);
  }

  getUsersInSameRoom(userId) {
    for (const [room, users] of this.rooms.entries()) {
      if (users.has(userId)) {
        return Array.from(users).filter((id) => id !== userId);
      }
    }
    return [];
  }

  getAllUserPositions(room = this.defaultRoom) {
    const users = this.rooms.get(room);
    if (!users) return {};

    const positions = {};
    for (const userId of users) {
      const userData = this.userPositions.get(userId);
      if (userData) {
        positions[userId] = userData;
      }
    }
    return positions;
  }

  getUserRoom(userId) {
    for (const [room, users] of this.rooms.entries()) {
      if (users.has(userId)) {
        return room;
      }
    }
    return null;
  }

  generateRandomColor() {
    const colors = [
      0xff6b6b, // Red
      0x4ecdc4, // Teal
      0xffe66d, // Yellow
      0x95e1d3, // Mint
      0xf38181, // Pink
      0xaa96da, // Purple
      0xfcbad3, // Light Pink
      0xa8d8ea, // Light Blue
      0xfddb92, // Orange
      0xc7ceea, // Lavender
    ];

    return colors[Math.floor(Math.random() * colors.length)];
  }

  getRoomStats() {
    const stats = {};
    for (const [room, users] of this.rooms.entries()) {
      stats[room] = users.size;
    }
    return stats;
  }
}

module.exports = RoomManager;
