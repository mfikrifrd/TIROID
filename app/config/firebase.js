// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from 'firebase/database';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtreI7aQNoRUJ4bv2ZJyrkEe0Qhpo5iW4",
  authDomain: "jumat-f3120.firebaseapp.com",
  databaseURL: "https://jumat-f3120-default-rtdb.firebaseio.com",
  projectId: "jumat-f3120",
  storageBucket: "jumat-f3120.firebasestorage.app",
  messagingSenderId: "677548960339",
  appId: "1:677548960339:web:c0b9f7ee35f9aed25574a6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };