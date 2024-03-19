const database = include('databaseConnection');

async function createUser(postData) {
	let createUserSQL = `
		INSERT INTO user
		(email, username, password_hash)
		VALUES
		(:email, :user, :passwordHash);
	`;

	let params = {
		email: postData.email,
		user: postData.user,
		passwordHash: postData.hashedPassword
	}
	
	try {
		const results = await database.query(createUserSQL, params);

        console.log("Successfully created user");
		console.log(results[0]);
		return true;
	}
	catch(err) {
		console.log("Error inserting user");
        console.log(err);
		return false;
	}
}

async function getUsers(postData) {
	let getUsersSQL = `
		SELECT username, password
		FROM user
		WHERE username = '${postData.user}';
	`;
	
	try {
		const results = await database.query(getUsersSQL);

        console.log("Successfully retrieved users");
		console.log(results[0]);
		return results[0];
	}
	catch(err) {
		console.log("Error getting users");
        console.log(err);
		return false;
	}
}

async function getUser(postData) {
	let getUserSQL = `SELECT * FROM user WHERE username = '${postData.user}'`

	try {
		const results = await database.query(getUserSQL);

        console.log("Successfully found user");
		console.log(results[0]);
		return results[0];
	}
	catch(err) {
		console.log("Error trying to find user");
        console.log(err);
		return false;
	}
}

async function getUserByUsername(username) {
    const getUserByUsernameSQL = `
        SELECT *
        FROM user
        WHERE username = ?
    `;
    try {
        const [rows] = await database.query(getUserByUsernameSQL, [username]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error("Error getting user by username:", error);
        throw error;
    }
}

async function getAllUsers(excludeCurrentUser) {
    let getAllUsersSQL = `
        SELECT username
        FROM user
    `;

    if (excludeCurrentUser) {
        const currentUser = await getUser({ user: excludeCurrentUser });
        if (currentUser) {
            getAllUsersSQL += ` WHERE username != '${excludeCurrentUser}'`;
        }
    }

    try {
        const [rows] = await database.query(getAllUsersSQL);
        return rows;
    } catch (error) {
        console.error("Error getting all users:", error);
        return [];
    }
}

async function getGroupMembers(groupId) {
    try {
        const query = `SELECT u.username
		FROM user u
		JOIN room_user ru ON u.user_id = ru.user_id
		JOIN room r ON ru.room_id = r.room_id
		WHERE r.room_id = ?
		`;
        const [rows, fields] = await database.query(query, [groupId]);
        return rows;
    } catch (error) {
        throw error;
    }
}

// Function to add emoji reaction to a message
async function addMessageReaction(messageId, emojiId, userId) {
    try {
        // Insert the emoji reaction into the message_reaction table
        const query = `
            INSERT INTO message_reaction (message_id, emoji_id, user_id)
            VALUES (?, ?, ?)
        `;
        await database.query(query, [messageId, emojiId, userId]);
    } catch (error) {
        console.error("Error adding message reaction:", error);
        throw error;
    }
}


module.exports = {createUser, getUsers, getUser, getUserByUsername, getAllUsers, getGroupMembers, addMessageReaction};