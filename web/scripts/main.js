/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// Initializes FriendlyChat.
function FriendlyChat() {

  // Shortcuts to DOM Elements.
  this.messageList = document.getElementById('messages');
  this.resultList = document.getElementById('results');
  this.messageForm = document.getElementById('message-form');
  this.messageInput = document.getElementById('message');
  this.submitButton = document.getElementById('submit');
  this.goingButton = document.getElementById('going');
  this.goingStatus = document.getElementById('going-status');
  this.userPic = document.getElementById('user-pic');
  this.userName = document.getElementById('user-name');
  this.signInButton = document.getElementById('sign-in');
  this.signOutButton = document.getElementById('sign-out');
  this.signInSnackbar = document.getElementById('must-signin-snackbar');

  // Saves message on form submit.
  this.messageForm.addEventListener('submit', this.savePlace.bind(this));
  this.goingButton.addEventListener('click', this.addGoing.bind(this));
  this.signOutButton.addEventListener('click', this.signOut.bind(this));
  this.signInButton.addEventListener('click', this.signIn.bind(this));


  // Toggle for the button.
  var buttonTogglingHandler = this.toggleButton.bind(this);
  this.messageInput.addEventListener('keyup', buttonTogglingHandler);
  this.messageInput.addEventListener('change', buttonTogglingHandler);

  this.initFirebase();
}

// Sets up shortcuts to Firebase features and initiate firebase auth.
FriendlyChat.prototype.initFirebase = function() {
  // Shortcuts to Firebase SDK features.
  this.auth = firebase.auth();
  this.database = firebase.database();
  this.storage = firebase.storage();
  // Initiates Firebase auth and listen to auth state changes.
  this.auth.onAuthStateChanged(this.onAuthStateChanged.bind(this));
};

// Loads chat messages history and listens for upcoming ones.
FriendlyChat.prototype.loadMessages = function() {

  // Make sure we remove all previous listeners.
  this.database.ref('/users').child(this.uid).off();

  // Loads all the places from each user's preference
  var setMessage = function(data) {
    this.displayMessage(data.key, data.val());
  }.bind(this);
  this.usersRef.child(this.uid).on('child_added', setMessage);
  this.usersRef.child(this.uid).on('child_changed', setMessage);
};

// Loads chat messages history and listens for upcoming ones.
FriendlyChat.prototype.loadResults = function() {
  var setResult = function(data) {
    if(data.val()) {
      this.displayResult(data.key);
    } else {
      this.removeResult(data.key);
    }
  }.bind(this);
  this.messagesRef.on('child_added', setResult);
  this.messagesRef.on('child_changed', setResult);
};

// Saves a new message on the Firebase DB.
FriendlyChat.prototype.savePlace = function(e) {
  e.preventDefault();
  // Check that the user entered a message and is signed in.
  if (this.messageInput.value && this.checkSignedInWithMessage()) {
    // Add a new message entry to the Firebase Database.
    var place = this.messageInput.value;
    this.messagesRef.child(this.messageInput.value).set(true).then(function() {
      //add new place to all users
      window.friendlyChat.database.ref('users').once('value',function(usersSnapshot){
        usersSnapshot.forEach(function(userSnapshot){
          var uid = userSnapshot.key;
          window.friendlyChat.database.ref('users/' + uid + '/' + place).set(true);
        });
      });
      window.friendlyChat.updateResults();
      // Clear message text field and SEND button state.
      FriendlyChat.resetMaterialTextfield(this.messageInput);
      this.toggleButton();
      }.bind(this)).catch(function(error) {
        console.error('Error writing new message to Firebase Database', error);
      });
  }
};

FriendlyChat.prototype.addGoing = function(e) {
  e.preventDefault();
  if(this.checkSignedInWithMessage()) {
    this.toggleGoingButton();
  }
}

FriendlyChat.prototype.updateResults = function() {
  this.messagesRef.once('value',function(messagesSnapshot){
    messagesSnapshot.forEach(function(placeSnapshot){
      var placeName = placeSnapshot.key;
      window.friendlyChat.usersRef.once('value',function(usersSnapshot) {
        var allUsers = usersSnapshot.val();
        window.friendlyChat.goingRef.once('value',function(goingUsersSnapshot) {
          var resultIsPossible = true;
            for(var uid in allUsers) {
              if(!allUsers[uid][placeName] && goingUsersSnapshot.val()[uid]) {
                resultIsPossible = false;
              }
            }
          window.friendlyChat.messagesRef.child(placeName).set(resultIsPossible);
        });
      });
    });
  });
};

// Signs-in Friendly Chat.
FriendlyChat.prototype.signIn = function() {
  // Sign in Firebase using popup auth and Google as the identity provider.
  var provider = new firebase.auth.GoogleAuthProvider();
  this.auth.signInWithPopup(provider);
};

// Signs-out of Friendly Chat.
FriendlyChat.prototype.signOut = function() {
  // Sign out of Firebase.
  this.auth.signOut();
};

// Triggers when the auth state change for instance when the user signs-in or signs-out.
FriendlyChat.prototype.onAuthStateChanged = function(user) {
  if (user) { // User is signed in!
    // Get profile pic and user's name from the Firebase user object.
    var profilePicUrl = user.photoURL;
    var userName = user.displayName;

    var uid = this.auth.currentUser.uid;
    this.uid = uid;

    // Set the user's profile pic and name.
    this.userPic.style.backgroundImage = 'url(' + (profilePicUrl || '/images/profile_placeholder.png') + ')';
    this.userName.textContent = userName;

    // Show user's profile and sign-out button.
    this.userName.removeAttribute('hidden');
    this.userPic.removeAttribute('hidden');
    this.signOutButton.removeAttribute('hidden');

    // Hide sign-in button.
    this.signInButton.setAttribute('hidden', 'true');

    // Reference to the /messages/ database path.
    this.messagesRef = this.database.ref('messages');

    // Reference to the /going/ database path
    this.goingRef = this.database.ref('going');

    //add user to user database
    this.usersRef = this.database.ref('users');
    
    this.usersRef.once('value', function(snapshot){
      if(!snapshot.hasChild(uid)) {
        //Add new user with default all places set to true
        window.friendlyChat.database.ref('messages').on('value',function(messagesSnapshot){
          messagesSnapshot.forEach(function(placeSnapshot){
            var placeName = placeSnapshot.key;
             window.friendlyChat.database.ref('users/' + uid + '/' + placeName).set(true);
          });
        });
      }
    });

    this.database.ref('going/' + uid).once('value',function(snapshot) {
      window.friendlyChat.goingButton.removeAttribute('hidden');
      window.friendlyChat.goingStatus.removeAttribute('hidden');
      if(!snapshot.exists()) {
        window.friendlyChat.database.ref('going/' + uid).set(false);
      }
      if(snapshot.val()) {
        window.friendlyChat.updateGoingStatus(true);
      } else {
        window.friendlyChat.updateGoingStatus(false);
      }
    });
    
    // We load currently existing chant messages.
    this.loadMessages();
    this.loadResults();

    this.goingButton.removeAttribute('disabled');
    // We save the Firebase Messaging Device token and enable notifications.
    //this.saveMessagingDeviceToken();
  } else { // User is signed out!
    // Hide user's profile and sign-out button.
    this.userName.setAttribute('hidden', 'true');
    this.userPic.setAttribute('hidden', 'true');
    this.signOutButton.setAttribute('hidden', 'true');

    this.goingButton.setAttribute('disabled','true');

    // Show sign-in button.
    this.signInButton.removeAttribute('hidden');

    this.goingButton.setAttribute('hidden', 'true');
    this.goingStatus.setAttribute('hidden', 'true');
  }
};

// Returns true if user is signed-in. Otherwise false and displays a message.
FriendlyChat.prototype.checkSignedInWithMessage = function() {
  // Return true if the user is signed in Firebase
  if (this.auth.currentUser) {
    return true;
  }

  // Display a message to the user using a Toast.
  var data = {
    message: 'You must sign-in first',
    timeout: 2000
  };
  this.signInSnackbar.MaterialSnackbar.showSnackbar(data);
  return false;
};

// Resets the given MaterialTextField.
FriendlyChat.resetMaterialTextfield = function(element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
};

// Template for messages.
FriendlyChat.MESSAGE_TEMPLATE =
    '<div class="message-container">' +
      '<div class="spacing"><input type="checkbox" onClick="window.friendlyChat.checkBoxChanged(this);"></div>' +
      '<div class="message"></div>' +
    '</div>';

// A loading image URL.
FriendlyChat.LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif';

// Displays a Message in the UI.
FriendlyChat.prototype.displayMessage = function(name, isChecked) {
  var div = document.getElementById("place-" + name);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = FriendlyChat.MESSAGE_TEMPLATE;
    div = container.firstChild;
    div.setAttribute('id', "place-" + name);
    this.messageList.appendChild(div);
  }

  var checkboxElement = div.firstChild.firstChild;
  if(isChecked) {
    checkboxElement.setAttribute('checked',true);
  }

  var messageElement = div.querySelector('.message').textContent = name;

  // Show the card fading-in and scroll to view the new message.
  setTimeout(function() {div.classList.add('visible')}, 1);
  this.messageList.scrollTop = this.messageList.scrollHeight;
  this.messageInput.focus();
};

// Template for results.
FriendlyChat.RESULT_TEMPLATE =
    '<div class="result-container">' +
      '<div class="spacing"></div>' +
      '<div class="result"></div>' +
    '</div>';

FriendlyChat.prototype.displayResult = function(name) {
  var div = document.getElementById("result-" + name);
  if(!div){
    var container = document.createElement('div');
    container.innerHTML = FriendlyChat.RESULT_TEMPLATE;
    div = container.firstChild;
    div.setAttribute('id', "result-" + name);
    this.resultList.appendChild(div);
  }
  div.querySelector('.result').textContent = name;
  div.removeAttribute('hidden');

};

FriendlyChat.prototype.removeResult = function(name) {
  var div = document.getElementById("result-" + name);
  div.setAttribute('hidden', 'true');

};

// Enables or disables the submit button depending on the values of the input
// fields.
FriendlyChat.prototype.toggleGoingButton = function() {
  this.database.ref('going/' + this.auth.currentUser.uid).once('value', function(snapshot) {
    var isGoing = snapshot.val();
    if(isGoing) {
      window.friendlyChat.database.ref('going/' + firebase.auth().currentUser.uid).set(false);
      window.friendlyChat.updateGoingStatus(false);
    } else {
      window.friendlyChat.database.ref('going/' + firebase.auth().currentUser.uid).set(true);
      window.friendlyChat.updateGoingStatus(true);
    }
  });
  this.updateResults();
};

FriendlyChat.prototype.updateGoingStatus = function(isGoing) {
  if(isGoing) {
    this.goingButton.innerHTML = "I'm Not Going to Lunch";
    this.goingStatus.innerHTML = "Going";
  } else {
    this.goingButton.innerHTML = "I'm Going to Lunch";
    this.goingStatus.innerHTML = "Not Going";
  }
}

// Enables or disables the submit button depending on the values of the input
// fields.
FriendlyChat.prototype.toggleButton = function() {
  if (this.messageInput.value) {
    this.submitButton.removeAttribute('disabled');
  } else {
    this.submitButton.setAttribute('disabled', 'true');
  }
};

FriendlyChat.prototype.checkBoxChanged = function(checkboxElement) {
  var uid = window.friendlyChat.auth.currentUser.uid;
  var place = checkboxElement.parentNode.nextSibling.innerHTML;
  if(place) {
    this.database.ref('users/' + uid +'/' + place).set(checkboxElement.checked);
    window.friendlyChat.updateResults();
  }
}

window.onload = function() {
  window.friendlyChat = new FriendlyChat();
};
