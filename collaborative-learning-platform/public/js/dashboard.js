document.addEventListener('DOMContentLoaded', () => {
    // Set welcome message
    fetch('/get-username')
        .then(res => res.json())
        .then(data => {
            if (data.username) {
                document.getElementById('welcome-message').textContent = 
                    `Welcome, ${data.username}!`;
            }
        });

    // Create group functionality
    document.getElementById('createGroupBtn').addEventListener('click', () => {
        const groupName = document.getElementById('groupName').value.trim();
        if (!groupName) return alert('Please enter a group name');

        fetch('/create-group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ groupName })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const display = document.getElementById('groupCodeDisplay');
                display.innerHTML = `
                    <p>Group created successfully!</p>
                    <p>Share this code to invite others: <strong>${data.groupCode}</strong></p>
                `;
                display.classList.remove('hidden');
                loadUserGroups();
            }
        });
    });

    // Join group functionality
    document.getElementById('joinGroupBtn').addEventListener('click', () => {
        const groupCode = document.getElementById('groupCodeInput').value.trim().toUpperCase();
        if (!groupCode) return alert('Please enter a group code');

        fetch('/join-group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ groupCode })
        })
        .then(res => res.json())
        .then(data => {
            const status = document.getElementById('joinStatus');
            if (data.success) {
                status.textContent = 'Successfully joined group!';
                status.style.color = 'green';
                loadUserGroups();
            } else {
                status.textContent = data.error || 'Failed to join group';
                status.style.color = 'red';
            }
        });
    });

    // Load user's groups
    function loadUserGroups() {
        fetch('/get-user-groups')
            .then(res => res.json())
            .then(groups => {
                const container = document.getElementById('groupsList');
                if (groups.length === 0) {
                    container.innerHTML = '<p>You are not in any groups yet.</p>';
                    return;
                }

                container.innerHTML = groups.map(group => `
                    <div class="group-item">
                        <span>${group.group_name}</span>
                        <span class="group-code">${group.group_code}</span>
                    </div>
                `).join('');
            });
    }

    // Initial load of groups
    loadUserGroups();
});