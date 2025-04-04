const socket = io(); // Connect to Socket.io server
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let isDrawing = false;

// Set initial canvas size
function resizeCanvas() {
  canvas.width = window.innerWidth * 0.9;
  canvas.height = window.innerHeight * 0.8;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Drawing functions
function startDrawing(e) {
  isDrawing = true;
  draw(e);
}

function stopDrawing() {
  isDrawing = false;
  ctx.beginPath();
}

function draw(e) {
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  ctx.lineWidth = document.getElementById('brushSize').value;
  ctx.lineCap = 'round';
  ctx.strokeStyle = document.getElementById('colorPicker').value;
  
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  
  // Send drawing data to server
  socket.emit('drawing', {
    x,
    y,
    color: ctx.strokeStyle,
    width: ctx.lineWidth
  });
}

// Receive drawing data from other clients
socket.on('drawing', (data) => {
  ctx.lineWidth = data.width;
  ctx.strokeStyle = data.color;
  ctx.lineCap = 'round';
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(data.x, data.y);
});

// Handle clear events
socket.on('clear', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Event listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clear');
});