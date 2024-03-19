const database = include('databaseConnection');

// async function getUserGroupsByUsername(username) {
//     const getUserGroupsSQL = `
//     SELECT r.room_id, r.name, 
//         CASE 
//             WHEN MAX(m.sent_datetime) IS NOT NULL THEN DATE_FORMAT(MAX(m.sent_datetime), '%b %d')
//             ELSE NULL
//         END AS last_message_date, 
//         DATEDIFF(CURDATE(), MAX(m.sent_datetime)) AS days_since_last_message,
//         COALESCE(SUM(CASE WHEN m.sent_datetime > CURDATE() THEN 1 ELSE 0 END), 0) AS unread_messages
//     FROM room_user ru
//     JOIN room r ON ru.room_id = r.room_id
//     LEFT JOIN message m ON ru.room_user_id = m.room_user_id
//     JOIN user u ON ru.user_id = u.user_id
//     WHERE u.username = ?
//     GROUP BY r.room_id, r.name
//     `;
//     try {
//         const [rows] = await database.query(getUserGroupsSQL, [username]);
//         return rows.map(group => ({
//             ...group,
//             days_since_last_message: group.days_since_last_message < 0 ? 0 : group.days_since_last_message
//         }));
//     } catch (error) {
//         console.error("Error getting user's groups:", error);
//         return [];
//     }
// }

async function getUserGroupsByUsername(username) {
    const getGroupNamesSQL = `
    SELECT r.room_id, r.name
    FROM room r
    JOIN room_user ru ON r.room_id = ru.room_id
    JOIN user u ON ru.user_id = u.user_id
    WHERE u.username = ?
    `;
    try {
        const [rows] = await database.query(getGroupNamesSQL, [username]);
        return rows;
    } catch (error) {
        console.error("Error getting user's group names:", error);
        return [];
    }
}

async function getLastReadMessageId(username, groupId) {
    const getLastReadMessageIdSQL = `
        SELECT last_read_message_id
        FROM room_user
        JOIN user ON room_user.user_id = user.user_id
        WHERE user.username = ? AND room_user.room_id = ?
    `;
    try {
        const [rows] = await database.query(getLastReadMessageIdSQL, [username, groupId]);
        return rows.length > 0 ? rows[0].last_read_message_id : null;
    } catch (error) {
        console.error("Error getting last read message ID:", error);
        throw error;
    }
}

async function getLastMessageForGroups(groupNames) {
    const lastMessages = [];
    for (const group of groupNames) {
        const getLastMessageSQL = `
            SELECT m.sent_datetime, m.text
            FROM message m
            JOIN room_user ru ON m.room_user_id = ru.room_user_id
            WHERE ru.room_id = ?
            ORDER BY m.sent_datetime DESC
            LIMIT 1
        `;
        try {
            const [rows] = await database.query(getLastMessageSQL, [group.room_id]);
            const lastMessage = rows[0] || { sent_datetime: null, text: null }; // Default values if no message found
            lastMessages.push({ ...group, lastMessage });
        } catch (error) {
            console.error("Error getting last message for group:", error);
            lastMessages.push({ ...group, lastMessage: { sent_datetime: null, text: null } });
        }
    }
    return lastMessages;
}

async function getUnreadMessagesCount(groupId, lastReadMessageId, userId) {
    const getUnreadMessagesCountSQL = `
    SELECT COUNT(*) AS unread_messages_count
    FROM message m
    JOIN room_user ru ON m.room_user_id = ru.room_user_id
    WHERE ru.room_id = ? AND m.message_id > ? AND ru.user_id != ?
    `;
    try {
        const [rows] = await database.query(getUnreadMessagesCountSQL, [groupId, lastReadMessageId, userId]);
        return rows[0].unread_messages_count;
    } catch (error) {
        console.error("Error getting unread messages count:", error);
        return 0;
    }
}

async function createGroup(groupName, creatorUsername, selectedUsers) {
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

        // Get creator user id
        const [creatorUser] = await database.query('SELECT user_id FROM user WHERE username = ?', [creatorUsername]);
        const creatorUserId = creatorUser[0]?.user_id; // Using optional chaining to handle potential undefined

        if (!creatorUserId) {
            throw new Error('Creator user not found');
        }

        // Link creator user to the group
        await database.query(createRoomUserSQL, [creatorUserId, groupId]);

        // If selectedUsers is not an array, make it an array with a single value
        if (!Array.isArray(selectedUsers)) {
            selectedUsers = [selectedUsers];
        }

        // Link selected users to the group
        for (const username of selectedUsers) {
            const [user] = await database.query('SELECT user_id FROM user WHERE username = ?', [username]);
            const userId = user[0]?.user_id; // Using optional chaining to handle potential undefined

            if (!userId) {
                console.error(`User '${username}' not found`);
                continue; // Skip this user and continue with the next one
            }

            await database.query(createRoomUserSQL, [userId, groupId]);
        }

        return true;
    } catch (error) {
        console.error("Error creating group:", error);
        return false;
    }
}

async function getGroupMessages(groupId) {
    const getGroupMessagesSQL = `
    SELECT m.message_id, m.text, m.sent_datetime, u.username
    FROM message m
    JOIN room_user ru ON m.room_user_id = ru.room_user_id
    JOIN user u ON ru.user_id = u.user_id
    WHERE ru.room_id = ?
    ORDER BY m.sent_datetime ASC
    `;
    try {
        const [rows] = await database.query(getGroupMessagesSQL, [groupId]);
        return rows;
    } catch (error) {
        console.error("Error getting group messages:", error);
        return [];
    }
}

async function getGroupNameById(groupId) {
    const getGroupNameSQL = 'SELECT name FROM room WHERE room_id = ?';
    try {
        const [rows] = await database.query(getGroupNameSQL, [groupId]);
        if (rows.length > 0) {
            return rows[0].name;
        } else {
            throw new Error('Group not found'); // Handle if group with given ID does not exist
        }
    } catch (error) {
        console.error("Error fetching group name:", error);
        throw error; // Rethrow the error to be handled in the route
    }
}

async function sendMessage(groupId, username, messageText) {
    const sendMessageSQL = `
        INSERT INTO message (room_user_id, sent_datetime, text)
        VALUES (
            (SELECT room_user_id FROM room_user WHERE room_id = ? AND user_id = (SELECT user_id FROM user WHERE username = ?)),
            NOW(),
            ?
        )
    `;
    try {
        await database.query(sendMessageSQL, [groupId, username, messageText]);
    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

async function isUserMemberOfGroup(username, groupId) {
    try {
      // Get the user ID using the username
      const [userResult] = await database.query('SELECT user_id FROM user WHERE username = ?', [username]);
      const userId = userResult[0].user_id;
  
      // Check if the user is a member of the group
      const [membership] = await database.query('SELECT 1 FROM room_user WHERE user_id = ? AND room_id = ?', [userId, groupId]);
  
      // Return true if the user is a member, false otherwise
      return membership.length > 0;
    } catch (error) {
      console.error("Error checking user membership:", error);
      throw error; // Propagate the error to the caller
    }
  }

module.exports = { getUserGroupsByUsername, getLastReadMessageId, getLastMessageForGroups, getUnreadMessagesCount, createGroup, getGroupMessages, getGroupNameById, sendMessage, isUserMemberOfGroup };