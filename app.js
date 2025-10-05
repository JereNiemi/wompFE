let jwtToken = null;
let notes = [];
let fetchIntervalId = null; 
// Tracks the ID of the note currently being dragged to prevent position reset by the interval.
let currentlyDraggingId = null; 

const loginScreen = document.getElementById('login-screen');
const notesScreen = document.getElementById('notes-screen');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginMsg = document.getElementById('login-msg');

const newNoteInput = document.getElementById('new-note-input');
const addNoteBtn = document.getElementById('add-note-btn');
const notesContainer = document.getElementById('notes-container');

const API_USERS = 'https://womp-24i1.onrender.com/users/login';
const API_NOTES = 'https://wompapi.onrender.com/notes';

// --- LOGOUT HELPER FUNCTION ---
function logoutUser() {
    if (fetchIntervalId) {
        clearInterval(fetchIntervalId);
        fetchIntervalId = null;
    }
    
    // Remove the token from local storage to log out permanently
    localStorage.removeItem('userToken'); 
    
    jwtToken = null;
    notes = [];
    notesContainer.innerHTML = '';
    notesScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginMsg.textContent = ''; // Clear login error messages
}


// --- LOGIN ---
loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(API_USERS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg);
        
        jwtToken = data.jwt;
        localStorage.setItem('userToken', jwtToken); 

        loginScreen.classList.add('hidden');
        notesScreen.classList.remove('hidden');

        await fetchNotes(); 
        // Start polling for changes from other users
        fetchIntervalId = setInterval(fetchNotes, 5000); 
    } catch (err) {
        loginMsg.textContent = 'Login failed: ' + err.message;
    }
});

// --- LOGOUT ---
logoutBtn.addEventListener('click', logoutUser);


// --- FETCH NOTES  ---
async function fetchNotes() {
    if (!jwtToken) return;

    const res = await fetch(API_NOTES, {
        headers: { Authorization: `Bearer ${jwtToken}` }
    });
    
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            logoutUser();
        }
        console.error('Failed to fetch notes:', res.statusText);
        return; 
    }
    
    notes = await res.json(); 
    renderNotes(); 
}

// --- CREATE NOTE ---
addNoteBtn.addEventListener('click', async () => {
    const noteText = newNoteInput.value.trim();
    if (!noteText) return;

    // Set initial coordinates for new notes
    // These values are sent to the API and used for immediate rendering
    const initialX = 50 + Math.floor(Math.random() * 20);
    const initialY = 50 + Math.floor(Math.random() * 20);

    try {
        const res = await fetch(API_NOTES, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwtToken}`
            },
            // Send x and y position for immediate placement
            body: JSON.stringify({ note: noteText, x: initialX, y: initialY })
        });

        if (!res.ok) {
            throw new Error('Failed to create note');
        }
        

        const data = await res.json(); 
        
        // Add the new note to the local array to display it immediately
        notes.unshift(data.note); 
        
        newNoteInput.value = '';
        
        // Render notes to display the new note without waiting for the interval
        renderNotes(); 
        
    } catch (error) {
        console.error('Error creating note:', error.message);
    }
});

// --- RENDER NOTES ---
function renderNotes() {
    const noteIdsFromAPI = new Set(notes.map(note => note.id));
    const currentNotesInDom = Array.from(notesContainer.querySelectorAll('.note'));

    // Remove notes that no longer exist in the API
    currentNotesInDom.forEach(el => {
        // Use Number() for comparison since note.id is a number from the API
        if (!noteIdsFromAPI.has(Number(el.dataset.id))) { 
            el.remove();
        }
    });

    // Iterate over the API notes to update/create elements
    notes.forEach(note => {
        let div = notesContainer.querySelector(`.note[data-id="${note.id}"]`);

        if (!div) {
            // Create a new element
            div = document.createElement('div');
            div.className = 'note';
            
            div.dataset.id = note.id.toString(); 
            notesContainer.appendChild(div);
            enableDrag(div); 
        }

        // Always update content (text)
        div.textContent = note.note;
        
        // Only update position if the note is NOT currently being dragged
        if (Number(note.id) !== Number(currentlyDraggingId)) {
            // Apply position from API data (or default to 50px)
            const xPos = (note.x !== undefined && note.x !== null) ? `${note.x}px` : '50px';
            const yPos = (note.y !== undefined && note.y !== null) ? `${note.y}px` : '50px';
            
            div.style.left = xPos;
            div.style.top = yPos;
        }
    });
}

// --- DRAG AND DROP ---
function enableDrag(el) {
    let offsetX, offsetY;
    const noteId = el.dataset.id.toString(); 

    el.addEventListener('mousedown', e => {
        // Set the ID of the note being dragged
        currentlyDraggingId = noteId; 
        
        el.classList.add('dragging');
        offsetX = e.offsetX;
        offsetY = e.offsetY;

        function onMouseMove(e) {
            // Keep the note within the viewport if desired (optional boundary checks omitted for brevity)
            el.style.left = e.pageX - offsetX + 'px';
            el.style.top = e.pageY - offsetY + 'px';
        }

        async function onMouseUp() {
            el.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Get final position
            const newX = parseInt(window.getComputedStyle(el).left);
            const newY = parseInt(window.getComputedStyle(el).top);

            // Update local notes array immediately
            const localNote = notes.find(n => n.id.toString() === noteId);
            if (localNote) {
                localNote.x = newX;
                localNote.y = newY;
            }
            
            // Clear the ID *after* the local array update and before the fetch completes
            currentlyDraggingId = null;

            // Send the new position to the server 
            await fetch(`${API_NOTES}/${noteId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${jwtToken}`
                },
                // Send only the position data 
                body: JSON.stringify({ x: newX, y: newY }) 
            });
            
            
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}



async function initializeApp() {
    // Check if a token exists in local storage
    const storedToken = localStorage.getItem('userToken');

    if (storedToken) {
        jwtToken = storedToken;
        
        loginScreen.classList.add('hidden');
        notesScreen.classList.remove('hidden');

        // Attempt to fetch notes to validate the token
        await fetchNotes(); 

        // If the token is still valid (i.e., jwtToken wasn't cleared by fetchNotes), start the interval
        if (jwtToken) { 
            fetchIntervalId = setInterval(fetchNotes, 5000); 
        } 
    }
}

// Call the initialization function when the script loads
initializeApp();