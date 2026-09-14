const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Store connected users: { socketId: { id, lat, lng, hint, interest, socketId } }
const activeUsers = {};

// Haversine formula to calculate distance in meters
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Receive location update from client
    socket.on('update_location', (data) => {
        activeUsers[socket.id] = {
            id: socket.id.substring(0, 5),
            lat: data.lat,
            lng: data.lng,
            hint: data.hint || "Exploring nearby vibes",
            socketId: socket.id,
            timestamp: new Date().toLocaleTimeString()
        };

        // Broadcast updated user list to Admin
        io.emit('admin_user_list', Object.values(activeUsers));

        // Send nearby anonymous users to the specific client
        const currentUser = activeUsers[socket.id];
        const nearbyUsers = [];

        Object.values(activeUsers).forEach(user => {
            if (user.socketId !== socket.id) {
                const distance = getDistanceInMeters(currentUser.lat, currentUser.lng, user.lat, user.lng);
                
                // Show users within 500 meters (anonymous info only)
                if (distance <= 500) {
                    nearbyUsers.push({
                        anonId: user.id,
                        distance: Math.round(distance), // in meters
                        hint: user.hint
                    });
                }
            }
        });

        socket.emit('nearby_radar_users', nearbyUsers);
    });

    // Handle "Interested" Pings
    socket.on('send_interest', (targetAnonId) => {
        const targetUser = Object.values(activeUsers).find(u => u.id === targetAnonId);
        if (targetUser) {
            io.to(targetUser.socketId).emit('received_interest', {
                message: "Someone nearby pressed Interested in your vibe!"
            });
        }
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        io.emit('admin_user_list', Object.values(activeUsers));
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Radar Server running on port ${PORT}`));
