// Copy this file to firebase-config.js and replace the config object with your Firebase project settings.
// Then include <script src="firebase-config.js"></script> before app.js in index.html (already included as example)

// example:
// const firebaseConfig = {
//   apiKey: "...",
//   authDomain: "...",
//   projectId: "...",
//   storageBucket: "...",
//   messagingSenderId: "...",
//   appId: "..."
// };

if (typeof firebaseConfig !== 'undefined') {
  firebase.initializeApp(firebaseConfig)
}
