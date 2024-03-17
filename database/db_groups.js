const database = include('databaseConnection');

async function getUserGroupsByUsername(username) {
    const getUserGroupsSQL = `
        SELECT r.name, 
               DATE_FORMAT(MAX(m.sent_datetime), '%b %d') AS last_message_date, 
               DATEDIFF(CURDATE(), MAX(m.sent_datetime)) AS days_since_last_message,
               COALESCE(SUM(CASE WHEN m.sent_datetime > CURDATE() THEN 1 ELSE 0 END), 0) AS unread_messages
        FROM room_user ru
        JOIN room r ON ru.room_id = r.room_id
        LEFT JOIN message m ON r.room_id = m.room_user_id
        JOIN user u ON ru.user_id = u.user_id
        WHERE u.username = ?
        GROUP BY r.room_id, r.name
    `;
    try {
        const [rows] = await database.query(getUserGroupsSQL, [username]);
        return rows.map(group => ({
            ...group,
            days_since_last_message: group.days_since_last_message < 0 ? 0 : group.days_since_last_message
        }));
    } catch (error) {
        console.error("Error getting user's groups:", error);
        return [];
    }
}

async function createGroup(userId, groupName) {
    const createGroupSQL = `
        INSERT INTO room (name, start_datetime)
        VALUES (?, NOW())
    `;
    const createRoomUserSQL = `
        INSERT INTO room_user (user_id, room_id)
        VALUES (?, ?)
    `;
    try {
        // Insert new group
        const [groupResult] = await database.query(createGroupSQL, [groupName]);
        const groupId = groupResult.insertId;
        // Link user to the group
        await database.query(createRoomUserSQL, [userId, groupId]);
        return true;
    } catch (error) {
        console.error("Error creating group:", error);
        return false;
    }
}

module.exports = { getUserGroupsByUsername, createGroup };