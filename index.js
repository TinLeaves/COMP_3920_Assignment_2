require("./utils");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const database = include('databaseConnection');
const db_utils = include('database/db_utils');
const db_users = include('database/db_users');
const success = db_utils.printMySQLVersion();

const port = process.env.PORT || 3020;

const app = express();

const Joi = require("joi");

app.use('/public', express.static('public'));

app.set('view engine', 'ejs');

const expireTime = 1 * 60 * 60 * 1000; //expires after 1 hour  (hours * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

app.use(express.urlencoded({ extended: false }));

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
  crypto: {
    secret: mongodb_session_secret
  }
});

app.use(session({
  secret: node_session_secret,
  store: mongoStore,
  saveUninitialized: false,
  resave: true
}
));

function isValidSession(req) {
  if (req.session.authenticated) {
    return true;
  }
  return false;
}

function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    next();
  }
  else {
    res.redirect('/login');
  }
}

app.get('/', (req, res) => {
  const authenticated = req.session.authenticated;
  const username = req.session.username;

  res.render('index', { authenticated, username });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signupSubmit', async (req, res) => {
  var username = req.body.username;
  var email = req.body.email;
  var password = req.body.password;

  // Check for empty fields
  let errorMsg = "";
  if (!username) {
    errorMsg += "Name is required.";
  }
  if (!email) {
    errorMsg += "Email is required.";
  }
  if (!password) {
    errorMsg += "Password is required.";
  }
  if (errorMsg !== "") {
    res.redirect(`/signup?error=${encodeURIComponent(errorMsg)}`);
    return;
  }

  // Validate inputs using Joi
  const schema = Joi.object({
    username: Joi.string().alphanum().max(20).required(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{10,}$'))
      .required()
  });

  const validationResult = schema.validate({ username, email, password });
  if (validationResult.error != null) {
    console.log(validationResult.error);
    res.redirect("/signup");
    return;
  }

  // Check if username already exists in MySQL database
  const existingUser = await db_users.getUser({ user: username });
  if (existingUser) {
    const errorMsg = "Username already exists.";
    res.render('signupSubmit', { errorMsg: errorMsg });
    return;
  }

  // Hash password
  var hashedPassword = await bcrypt.hash(password, saltRounds);

  // Insert user into MySQL database
  const createUserResult = await db_users.createUser({
    user: username,
    hashedPassword: hashedPassword,
    email: email
  });

  if (!createUserResult) {
    console.log("Error inserting user into MySQL database");
    res.redirect("/signup");
    return;
  }

  // Set session variables
  req.session.authenticated = true;
  req.session.username = username;
  req.session.email = email;
  req.session.user_type = "user";

  res.redirect("/members");
});


app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/loginSubmit', async (req, res) => {
  // extract username and password from request body
  const { username, password } = req.body;

  // Login handler
  // Validate username
  const usernameSchema = Joi.string().alphanum().max(20).required();
  const usernameValidationResult = usernameSchema.validate(username);
  if (usernameValidationResult.error != null) {
    console.log(usernameValidationResult.error);
    res.redirect('/login');
    return;
  }

  // Find user in database using username
  const user = await db_users.getUser({ user: username });

  if (!user) {
    console.log('Invalid username/password combination');
    const errorMsg = 'Invalid username/password combination.';
    res.render('loginSubmit', { errorMsg: errorMsg });
    return;
  }

  // Compare password with stored BCrypt password
  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    console.log('Password is incorrect');
    const errorMsg = 'Password is incorrect.';
    res.render('loginSubmit', { errorMsg: errorMsg });
    return;
  }

  // Store username in session
  req.session.authenticated = true;
  req.session.username = user.username;
  req.session.cookie.maxAge = expireTime;
  req.session.user_type = user.user_type;

  // Redirect to members page
  res.redirect('/members');
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});
