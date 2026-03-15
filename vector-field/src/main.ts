// 1. Get the canvas and WebGL2 context
const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');

if (!gl) {
    throw new Error('WebGL2 not supported in this browser.');
}

// 2. Handle Window Resizing
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl!.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const vertexShaderSource = `#version 300 es
    in vec2 a_position; // The geometry of a single arrow
    in vec2 a_offset;   // The grid location for this specific instance

    uniform vec2 u_resolution; // Used to fix the aspect ratio

    void main() {
        // Base position is the grid location plus the arrow geometry
        vec2 finalPos = a_offset + a_position;

        // Fix aspect ratio so arrows don't stretch when you resize the window
        float aspect = u_resolution.x / u_resolution.y;
        finalPos.x /= aspect; 

        gl_Position = vec4(finalPos, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `#version 300 es
    precision highp float;
    out vec4 outColor;
    
    void main() {
        // A nice 3b1b-style blue/teal for the vectors
        outColor = vec4(0.2, 0.7, 0.9, 1.0); 
    }
`;
// Helper function to compile shaders
function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }
    return shader;
}

// 4. Compile and Link the Shader Program
const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = gl.createProgram()!;

gl.attachShader(program, vertexShader!);
gl.attachShader(program, fragmentShader!);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

// -- GEOMETRY: Define a simple arrow (a triangle pointing right) --
const arrowVertices = new Float32Array([
     0.02,  0.00,  // Tip
    -0.02, -0.01,  // Bottom left
    -0.02,  0.01   // Top left
]);

// -- INSTANCES: Calculate a grid of positions --
const gridCols = 40;
const gridRows = 40;
const numInstances = gridCols * gridRows;
const offsets = new Float32Array(numInstances * 2); // x, y for each instance

let index = 0;
for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
        // Map grid x,y to WebGL coordinates (-1.0 to 1.0)
        const xPos = (x / (gridCols - 1)) * 2.0 - 1.0;
        const yPos = (y / (gridRows - 1)) * 2.0 - 1.0;
        
        offsets[index++] = xPos;
        offsets[index++] = yPos;
    }
}

// -- WEBGL SETUP: Bind data to the shaders --

// 1. Arrow Geometry Buffer
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, arrowVertices, gl.STATIC_DRAW);

const positionLoc = gl.getAttribLocation(program, "a_position");
gl.enableVertexAttribArray(positionLoc);
gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

// 2. Instance Offset Buffer
const offsetBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);

const offsetLoc = gl.getAttribLocation(program, "a_offset");
gl.enableVertexAttribArray(offsetLoc);
gl.vertexAttribPointer(offsetLoc, 2, gl.FLOAT, false, 0, 0);

// THE MAGIC LINE: Tell WebGL this attribute changes per *instance*, not per *vertex*
gl.vertexAttribDivisor(offsetLoc, 1); 

// Get uniform location for aspect ratio
const resolutionLoc = gl.getUniformLocation(program, "u_resolution");

// 5. The Render Loop
function render(time: number) {
    gl!.clearColor(0.05, 0.05, 0.05, 1.0); // Slightly darker background
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    gl!.useProgram(program);

    // Pass the canvas resolution to the shader to fix stretching
    gl!.uniform2f(resolutionLoc, canvas.width, canvas.height);

    // Draw 3 vertices (the triangle), but do it `numInstances` times!
    gl!.drawArraysInstanced(gl!.TRIANGLES, 0, 3, numInstances);

    requestAnimationFrame(render);
}

// Start the loop
requestAnimationFrame(render);