const functions = require("firebase-functions");
const admin = require("firebase-admin");
const app = require("express")();
admin.initializeApp();

const firebaseConfig = {
  apiKey: "AIzaSyCH4uQXn_ae2O0oUMLWI-mo0bRoJvik8RU",
  authDomain: "craigslist-redux.firebaseapp.com",
  databaseURL: "https://craigslist-redux.firebaseio.com",
  projectId: "craigslist-redux",
  storageBucket: "craigslist-redux.appspot.com",
  messagingSenderId: "197322782010",
  appId: "1:197322782010:web:1527d5098ca8219c454c03",
  measurementId: "G-HRHKEQ1XSD",
};

const firebase = require("firebase");
firebase.initializeApp(firebaseConfig);

const db = admin.firestore();

app.get("/listings", (request, response) => {
  db.collection("listings")
    .orderBy("date", "desc")
    .get()
    .then((data) => {
      let listings = [];
      data.forEach((doc) => {
        listings.push({
          listingId: doc.id,
          title: doc.data().title,
          price: doc.data().price,
          date: doc.data().date,
          thumbnail: doc.data().thumbnail,
          image: doc.data().image,
          desc: doc.data().desc,
          id: doc.data().id,
        });
      });
      return response.json(listings);
    })
    .catch((err) => console.error(err));
});

const FBAuth = (req, res, next) => {
  let idToken;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else {
    console.error("No token found");
    return res.status(403).json({ error: "Unauthorized" })
  }

  admin.auth().verifyIdToken(idToken)
    .then(decodedToken => {
      req.user = decodedToken;
      console.log(decodedToken)
      return db.collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
    })
    .then(data => {
      req.user.handle = data.docs[0].data().handle;
      return next();
    })
    .catch(err => {
      console.error("Error while verifying token ", err);
      return res.status(403).json(err)
    })
}

app.post("/listing", FBAuth, (request, response) => {
  const newListing = {
    title: request.body.title,
    price: request.body.price,
    date: new Date().toISOString(),
    thumbnail: request.body.thumbnail,
    image: request.body.image,
    desc: request.body.desc,
    id: request.body.id,
  };

  db.collection("listings")
    .add(newListing)
    .then((doc) => {
      response.json({ message: `document ${doc.id} created successfully` });
    })
    .catch((err) => {
      response.status(500).json({ error: "Something went wrong" });
      console.error(err);
    });
});

const isEmail = (email) => {
  const emailRegEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  if (email.match(emailRegEx)) {
    return true;
  } else {
    return false;
  }
};

const isEmpty = (string) => {
  if (string.trim() === "") {
    return true;
  } else {
    return false;
  }
};

// Signup route
app.post("/signup", (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  let errors = {};

  if (isEmpty(newUser.email)) {
    errors.email = "Must not be empty";
  } else if (!isEmail(newUser.email)) {
    errors.email = "Must be a valid email address";
  }

  if (isEmpty(newUser.password)) {
    errors.password = "Must not be empty";
  }
  if (newUser.password !== newUser.confirmPassword) {
    errors.confirmPassword = "Passwords must match";
  }
  if (isEmpty(newUser.handle)) {
    errors.handle = "Must not be empty";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json(errors);
  }

  // TODO: validate data
  let token, userId;

  db.doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({ handle: "this handle already exists" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        userId,
      };
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: "email is already in use" });
      } else {
        return res.status(500).json({ error: err.code });
      }
    });
});

app.post("/login", (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  let errors = {};

  if (isEmpty(user.email)) {
    errors.email = "Must not be empty";
  }
  if (isEmpty(user.password)) {
    errors.password = "Must not be empty";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json(errors);
  }

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/wrong-password") {
        return res
          .status(403)
          .json({ general: "Wrong credentials, please try again" });
      }
      return res.status(500).json({ error: err.code });
    });
});

exports.api = functions.https.onRequest(app);
