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
    precision highp float;

    in vec2 a_position;
    in vec2 a_offset;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_orbitRadius;
    uniform float u_angularSpeed;
    uniform float u_waveSpeed;
    uniform float u_arrowScale;
    uniform float u_coulombStrength;
    uniform float u_radiationStrength;

    out float v_fieldMag;

    const float EPSILON = 1e-4;

    vec2 chargePosition(float theta) {
        return u_orbitRadius * vec2(cos(theta), sin(theta));
    }

    vec2 chargeBeta(float theta) {
        float speed = u_orbitRadius * u_angularSpeed;
        return (speed / u_waveSpeed) * vec2(-sin(theta), cos(theta));
    }

    vec2 chargeBetaDot(float theta) {
        float accel = u_orbitRadius * u_angularSpeed * u_angularSpeed;
        return (accel / u_waveSpeed) * vec2(-cos(theta), -sin(theta));
    }

    mat2 rotationFromDirection(vec2 direction) {
        return mat2(direction.x, direction.y, -direction.y, direction.x);
    }

    vec2 electricFieldAt(vec2 samplePos) {
        float thetaNow = u_angularSpeed * u_time;
        vec2 sourceNow = chargePosition(thetaNow);

        float initialDistance = max(length(samplePos - sourceNow), EPSILON);
        float tRet = u_time - initialDistance / u_waveSpeed;
        float thetaRet = u_angularSpeed * tRet;

        vec2 sourcePos = chargePosition(thetaRet);
        vec2 beta = chargeBeta(thetaRet);
        vec2 betaDot = chargeBetaDot(thetaRet);

        vec2 displacement = samplePos - sourcePos;
        float distanceSq = max(dot(displacement, displacement), EPSILON);
        float distanceToSource = sqrt(distanceSq);
        vec2 nHat = displacement / distanceToSource;

        float betaSq = min(dot(beta, beta), 0.95);
        float invGammaSq = max(1.0 - betaSq, EPSILON);
        float oneMinusBetaDotN = max(1.0 - dot(beta, nHat), 0.08);
        float denom = pow(oneMinusBetaDotN, 3.0);

        vec2 coulomb = u_coulombStrength * invGammaSq * (nHat - beta) / (denom * distanceSq);

        vec2 tripleProduct = (nHat - beta) * dot(nHat, betaDot) - betaDot * dot(nHat, nHat - beta);
        vec2 radiation = u_radiationStrength * tripleProduct / (u_waveSpeed * denom * distanceToSource);

        return coulomb + radiation;
    }

    void main() {
        float aspect = u_resolution.x / u_resolution.y;
        vec2 centerWorld = vec2(a_offset.x * aspect, a_offset.y);
        vec2 field = electricFieldAt(centerWorld);

        float fieldMag = length(field);
        v_fieldMag = fieldMag;

        vec2 direction = fieldMag > EPSILON ? field / fieldMag : vec2(1.0, 0.0);
        float arrowLength = u_arrowScale * (0.18 + log(1.0 + fieldMag * 10.0));

        vec2 localArrow = vec2(a_position.x * aspect, a_position.y);
        vec2 rotatedArrow = rotationFromDirection(direction) * (localArrow * arrowLength);
        vec2 finalWorld = centerWorld + rotatedArrow;

        gl_Position = vec4(finalWorld.x / aspect, finalWorld.y, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `#version 300 es
    precision highp float;

    in float v_fieldMag;
    out vec4 outColor;

    void main() {
        float compressed = log(1.0 + v_fieldMag * 14.0);
        float ripple = smoothstep(0.35, 1.9, compressed);
        float glow = smoothstep(0.9, 2.8, compressed);

        vec3 base = vec3(0.02, 0.05, 0.08);
        vec3 low = vec3(0.08, 0.30, 0.38);
        vec3 high = vec3(0.38, 0.92, 1.00);
        vec3 core = vec3(0.90, 0.98, 1.00);

        vec3 color = mix(base, low, ripple);
        color = mix(color, high, glow);
        color = mix(color, core, smoothstep(1.8, 3.4, compressed));

        outColor = vec4(color, 1.0);
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
const timeLoc = gl.getUniformLocation(program, "u_time");
const orbitRadiusLoc = gl.getUniformLocation(program, "u_orbitRadius");
const angularSpeedLoc = gl.getUniformLocation(program, "u_angularSpeed");
const waveSpeedLoc = gl.getUniformLocation(program, "u_waveSpeed");
const arrowScaleLoc = gl.getUniformLocation(program, "u_arrowScale");
const coulombStrengthLoc = gl.getUniformLocation(program, "u_coulombStrength");
const radiationStrengthLoc = gl.getUniformLocation(program, "u_radiationStrength");

const orbitRadius = 0.32;
const angularSpeed = 1.8;
const waveSpeed = 1.35;
const arrowScale = 0.1;
const coulombStrength = 0.012;
const radiationStrength = 0.08;

// 5. The Render Loop
function render(time: number) {
    gl!.clearColor(0.05, 0.05, 0.05, 1.0); // Slightly darker background
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    gl!.useProgram(program);

    // Pass the canvas resolution to the shader to fix stretching
    gl!.uniform2f(resolutionLoc, canvas.width, canvas.height);
    gl!.uniform1f(timeLoc, time * 0.001);
    gl!.uniform1f(orbitRadiusLoc, orbitRadius);
    gl!.uniform1f(angularSpeedLoc, angularSpeed);
    gl!.uniform1f(waveSpeedLoc, waveSpeed);
    gl!.uniform1f(arrowScaleLoc, arrowScale);
    gl!.uniform1f(coulombStrengthLoc, coulombStrength);
    gl!.uniform1f(radiationStrengthLoc, radiationStrength);

    // Draw 3 vertices (the triangle), but do it `numInstances` times!
    gl!.drawArraysInstanced(gl!.TRIANGLES, 0, 3, numInstances);

    requestAnimationFrame(render);
}

// Start the loop
requestAnimationFrame(render);