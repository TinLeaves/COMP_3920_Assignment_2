require('./utils');

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;


const database = include('databaseConnection');
const db_utils = include('database/db_utils');
const db_users = include('database/db_users');
const db_groups = include('database/db_groups');
const success = db_utils.printMySQLVersion();

const port = process.env.PORT || 3000;

const app = express();

const expireTime = 1 * 60 * 60 * 1000; 


/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

app.use('/public', express.static('public'));

app.set('view engine', 'ejs');

app.use(express.urlencoded({extended: false}));

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
	crypto: {
		secret: mongodb_session_secret
	}
})

app.use(session({ 
    secret: node_session_secret,
	store: mongoStore,
	saveUninitialized: false, 
	resave: true
}
));

let authenticated = false; // Initialize globally

// app.get('/', (req, res) => {
//   // Set authenticated based on session
//   const authenticated = isValidSession(req);
//   const username = req.session.username;
//   res.render('index', { authenticated, username });
// });

app.get('/', async (req, res) => {
  if (req.session.authenticated) {
    const username = req.session.username;
    try {
      const userGroups = await db_groups.getUserGroupsByUsername(username);
      const totalGroups = userGroups.length;
      res.render('index', { authenticated: true, username, userGroups, totalGroups });
    } catch (error) {
      console.error("Error rendering index:", error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.render('index', { authenticated: false });
  }
});


// Route to render the create group page
app.get('/createGroup', sessionValidation, async (req, res) => {
  try {
    const authenticated = isValidSession(req);
    const username = req.session.username;
    const users = await db_users.getAllUsers(); // Function to get all users from the database
    res.render('createGroup', { users, authenticated, username });
  } catch (error) {
    console.error("Error rendering create group page:", error);
    res.status(500).send('Internal Server Error');
  }
});

// Route to handle the form submission for creating a group
app.post('/createGroup', sessionValidation, async (req, res) => {
  const { groupName, selectedUsers } = req.body;
  const creatorUsername = req.session.username;
  try {
    // Implement function to create group with selected users
    const success = await db_groups.createGroup(groupName, creatorUsername, selectedUsers);
    if (success) {
      res.redirect('/');
    } else {
      res.status(500).send('Error creating group');
    }
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).send('Internal Server Error');
  }
});

// app.get('/signup', (req, res) => {
//   const errorMsg = req.query.error;
//   const signupError = req.query.signupError; 
//   const authenticated = isValidSession(req);
//   res.render('signup', { errorMsg, signupError, authenticated });
// });
app.get('/signup', (req, res) => {
  if (req.session.authenticated) {
    res.redirect('/');
  } else {
    const errorMsg = req.query.error;
    const signupError = req.query.signupError; 
    res.render('signup', { errorMsg, signupError, authenticated: false });
  }
});

app.post('/signupSubmit', async (req, res) => {
  const { username, email, password } = req.body;

  let errorMsg = '';

  if (!username) {
      errorMsg += 'Name is required. ';
  }
  if (!email) {
      errorMsg += 'Email is required. ';
  }
  if (!password) {
      errorMsg += 'Password is required. ';
  } else if (password.length < 10) {
      errorMsg += 'Password must be at least 10 characters long. ';
  } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errorMsg += 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character. ';
  }

  if (errorMsg !== '') {
      res.redirect(`/signup?error=${encodeURIComponent(errorMsg)}`);
      return;
  }

  const hashedPassword = bcrypt.hashSync(password, saltRounds);

  const success = await db_users.createUser({ email, user: username, hashedPassword });

  if (success) {
      req.session.authenticated = true;
      req.session.username = username;
      res.redirect('/page');
  } else {
      res.render('signup', { errorMsg: 'Username already exists. Please choose a different username.' });
  }
});

// app.get('/login', (req, res) => {
//   const loginMsg = req.query.error;
//   const authenticated = isValidSession(req);
//   res.render('login', { loginMsg, authenticated });
// });

app.get('/login', (req, res) => {
  if (req.session.authenticated) {
    res.redirect('/');
  } else {
    const loginMsg = req.query.error;
    res.render('login', { loginMsg, authenticated: false });
  }
});


app.post('/loginSubmit', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  let loginMsg = "";

  const results = await db_users.getUser({ user: username });

  console.log("Results from database:", results);

  if (!username || results.length !== 1) {
      loginMsg = "User not found. ";
      console.log("User not found.");
      res.redirect(`/login?error=${encodeURIComponent(loginMsg)}`);
      return;
  }

  const storedPassword = results[0].password_hash; 

  console.log("Input password:", password);
  console.log("Stored password hash:", storedPassword);


  if (!bcrypt.compare(password, storedPassword)) {
      loginMsg = "Incorrect password. Please try again. ";
      console.log("Incorrect password.");
      res.redirect(`/login?error=${encodeURIComponent(loginMsg)}`);
      return;
  }

  // If the password matches, set session variables and redirect
  req.session.authenticated = true;
  req.session.username = username;
  req.session.cookie.maxAge = expireTime;

  console.log("Login successful for user:", username);

  res.redirect('/'); 
});
  
// Middleware to check session validity
function isValidSession(req) {
  return req.session.authenticated ? true : false;
}

function sessionValidation(req, res, next) {
	if (!isValidSession(req)) {
		req.session.destroy();
		res.redirect('/');
		return;
	}
	else {
		next();
	}
}

app.get('/logout', (req, res) => {
  req.session.destroy();
  authenticated = false; // Set authenticated to false
  res.redirect('/');
});

app.use(express.static(__dirname + "/public"));

app.get('*', (req, res) => {
  const authenticated = isValidSession(req);
  res.status(404).render('404', { authenticated });
});

app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 
