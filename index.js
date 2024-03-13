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

app.get('/', (req, res) => {
    const authenticated = req.session.authenticated;
    const username = req.session.username;
  
    res.render('index', { authenticated, username });
});

app.get('/signup', (req, res) => {
    const errorMsg = req.query.error;
    const signupError = req.query.signupError; // Add this line to retrieve signupError
    res.render('signup', { errorMsg, signupError });
});

// app.post('/signupSubmit', async (req,res) => {
//   var username = req.body.username;
//   var email = req.body.email;
//   var password = req.body.password;

//   // Check for empty fields
//   let errorMsg = "";
//   if (!username) {
//     errorMsg += "Name is required.";
//   }
//   if (!email) {
//     errorMsg += "Email is required.";
//   }
//   if (!password) {
//     errorMsg += "Password is required.";
//   }
//   if (errorMsg !== "") {
//     res.redirect(`/signup?error=${encodeURIComponent(errorMsg)}`);
//     return;
//   }

//     var hashedPassword = bcrypt.hashSync(password, saltRounds);

//     var success = await db_users.createUser({email: email, user: username, hashedPassword: hashedPassword });

//     if (success) {
//         req.session.authenticated = true;
//         req.session.username = username;
//         res.redirect("/members");
//     } else {
//         res.render('signup', { 
//             errorMsg: "Username already exists. Please choose a different username."
//         });
//     }
// });

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
      res.redirect('/members');
  } else {
      res.render('signup', { errorMsg: 'Username already exists. Please choose a different username.' });
  }
});

app.get('/login', (req, res) => {
    const loginMsg = req.query.error;
    res.render('login', { loginMsg });
  });

app.post('/loginSubmit', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    let loginMsg = "";

    const results = await db_users.getUser({ user: username });

    if (!username || results.length !== 1) {
        loginMsg = "User not found. ";
        res.redirect(`/login?error=${encodeURIComponent(loginMsg)}`);
        return;
    }

    if (!password) {
        loginMsg = "Incorrect password. Please try again. ";
        res.redirect(`/login?error=${encodeURIComponent(loginMsg)}`);
        return;
    }

    const storedPassword = results[0].password;
    if (bcrypt.compareSync(password, storedPassword)) {
        req.session.authenticated = true;
        req.session.username = username;
        req.session.cookie.maxAge = expireTime;

        res.redirect('/members');
        return;
    } else {
        loginMsg = "Incorrect password. Please try again. ";
        res.redirect(`/login?error=${encodeURIComponent(loginMsg)}`);
        return;
    }
});

  
function isValidSession(req) {
	if (req.session.authenticated) {
		return true;
	}
	return false;
}

function sessionValidation(req, res, next) {
	if (!isValidSession(req)) {
		req.session.destroy();
		res.redirect('/login');
		return;
	}
	else {
		next();
	}
}

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });

app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.render("404");
})

app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 
