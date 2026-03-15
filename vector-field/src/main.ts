import {
    chargeFragmentShaderSource,
    chargeVertexShaderSource,
    fieldFragmentShaderSource,
    fieldVertexShaderSource,
} from './shaders';
import {
    createProgram,
    requireAttribLocation,
    requireUniformLocation,
} from './webgl-utils';

const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
const glContext = canvas.getContext('webgl2');

if (!glContext) {
    throw new Error('WebGL2 not supported in this browser.');
}

const gl: WebGL2RenderingContext = glContext;

function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const fieldProgram = createProgram(gl, fieldVertexShaderSource, fieldFragmentShaderSource);
const chargeProgram = createProgram(gl, chargeVertexShaderSource, chargeFragmentShaderSource);

const arrowVertices = new Float32Array([
    0.02, 0.0,
    -0.02, -0.01,
    -0.02, 0.01,
]);

const gridCols = 100;
const gridRows = 100;
const numInstances = gridCols * gridRows;
const offsets = new Float32Array(numInstances * 2);

let writeIndex = 0;
for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
        offsets[writeIndex++] = (x / (gridCols - 1)) * 2.0 - 1.0;
        offsets[writeIndex++] = (y / (gridRows - 1)) * 2.0 - 1.0;
    }
}

const fieldVao = gl.createVertexArray();
if (!fieldVao) {
    throw new Error('Failed to create vertex array object.');
}

gl.bindVertexArray(fieldVao);

const positionBuffer = gl.createBuffer();
if (!positionBuffer) {
    throw new Error('Failed to create position buffer.');
}

gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, arrowVertices, gl.STATIC_DRAW);

const positionLoc = requireAttribLocation(gl, fieldProgram, 'a_position');
gl.enableVertexAttribArray(positionLoc);
gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

const offsetBuffer = gl.createBuffer();
if (!offsetBuffer) {
    throw new Error('Failed to create offset buffer.');
}

gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);

const offsetLoc = requireAttribLocation(gl, fieldProgram, 'a_offset');
gl.enableVertexAttribArray(offsetLoc);
gl.vertexAttribPointer(offsetLoc, 2, gl.FLOAT, false, 0, 0);
gl.vertexAttribDivisor(offsetLoc, 1);

gl.bindVertexArray(null);

type FieldUniforms = {
    resolution: WebGLUniformLocation;
    time: WebGLUniformLocation;
    orbitCenter: WebGLUniformLocation;
    orbitRadius: WebGLUniformLocation;
    angularSpeed: WebGLUniformLocation;
    waveSpeed: WebGLUniformLocation;
    arrowScale: WebGLUniformLocation;
    coulombStrength: WebGLUniformLocation;
    radiationStrength: WebGLUniformLocation;
};

type ChargeUniforms = {
    resolution: WebGLUniformLocation;
    time: WebGLUniformLocation;
    orbitCenter: WebGLUniformLocation;
    orbitRadius: WebGLUniformLocation;
    angularSpeed: WebGLUniformLocation;
    pointSize: WebGLUniformLocation;
};

const fieldUniforms: FieldUniforms = {
    resolution: requireUniformLocation(gl, fieldProgram, 'u_resolution'),
    time: requireUniformLocation(gl, fieldProgram, 'u_time'),
    orbitCenter: requireUniformLocation(gl, fieldProgram, 'u_orbitCenter'),
    orbitRadius: requireUniformLocation(gl, fieldProgram, 'u_orbitRadius'),
    angularSpeed: requireUniformLocation(gl, fieldProgram, 'u_angularSpeed'),
    waveSpeed: requireUniformLocation(gl, fieldProgram, 'u_waveSpeed'),
    arrowScale: requireUniformLocation(gl, fieldProgram, 'u_arrowScale'),
    coulombStrength: requireUniformLocation(gl, fieldProgram, 'u_coulombStrength'),
    radiationStrength: requireUniformLocation(gl, fieldProgram, 'u_radiationStrength'),
};

const chargeUniforms: ChargeUniforms = {
    resolution: requireUniformLocation(gl, chargeProgram, 'u_resolution'),
    time: requireUniformLocation(gl, chargeProgram, 'u_time'),
    orbitCenter: requireUniformLocation(gl, chargeProgram, 'u_orbitCenter'),
    orbitRadius: requireUniformLocation(gl, chargeProgram, 'u_orbitRadius'),
    angularSpeed: requireUniformLocation(gl, chargeProgram, 'u_angularSpeed'),
    pointSize: requireUniformLocation(gl, chargeProgram, 'u_pointSize'),
};

const orbitRadius = 0.32;
const angularSpeed = 0.9;
const waveSpeed = 1.35;
const arrowScale = 0.11;
const coulombStrength = 0.012;
const radiationStrength = 0.08;
const chargePointSize = 20;
const grabRadius = 0.11;

const orbitCenter = { x: 0.0, y: 0.0 };
let dragging = false;
let dragTarget: { x: number; y: number } | null = null;
let lastTimeSeconds = 0;

function toWorldPosition(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2.0 - 1.0;
    const normalizedY = 1.0 - ((event.clientY - rect.top) / rect.height) * 2.0;
    const aspect = canvas.width / canvas.height;

    return {
        x: normalizedX * aspect,
        y: normalizedY,
    };
}

function getOrbitVector(timeSeconds: number): { x: number; y: number } {
    const theta = angularSpeed * timeSeconds;
    return {
        x: orbitRadius * Math.cos(theta),
        y: orbitRadius * Math.sin(theta),
    };
}

function getChargePosition(timeSeconds: number): { x: number; y: number } {
    const orbitVector = getOrbitVector(timeSeconds);
    return {
        x: orbitCenter.x + orbitVector.x,
        y: orbitCenter.y + orbitVector.y,
    };
}

function updateOrbitCenterFromDrag(timeSeconds: number): void {
    if (!dragging || !dragTarget) {
        return;
    }

    const orbitVector = getOrbitVector(timeSeconds);
    orbitCenter.x = dragTarget.x - orbitVector.x;
    orbitCenter.y = dragTarget.y - orbitVector.y;
}

canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', (event) => {
    const pointerWorld = toWorldPosition(event);
    const chargeWorld = getChargePosition(lastTimeSeconds);
    const dx = pointerWorld.x - chargeWorld.x;
    const dy = pointerWorld.y - chargeWorld.y;

    if ((dx * dx + dy * dy) <= grabRadius * grabRadius) {
        dragging = true;
        dragTarget = pointerWorld;
        canvas.setPointerCapture(event.pointerId);
    }
});

canvas.addEventListener('pointermove', (event) => {
    if (!dragging) {
        return;
    }

    dragTarget = toWorldPosition(event);
});

canvas.addEventListener('pointerup', (event) => {
    if (!dragging) {
        return;
    }

    dragging = false;
    dragTarget = null;
    canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener('pointercancel', (event) => {
    if (!dragging) {
        return;
    }

    dragging = false;
    dragTarget = null;
    canvas.releasePointerCapture(event.pointerId);
});

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

function render(timeMs: number): void {
    const timeSeconds = timeMs * 0.001;
    lastTimeSeconds = timeSeconds;

    updateOrbitCenterFromDrag(timeSeconds);

    gl.clearColor(0.05, 0.05, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(fieldProgram);
    gl.bindVertexArray(fieldVao);
    gl.uniform2f(fieldUniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(fieldUniforms.time, timeSeconds);
    gl.uniform2f(fieldUniforms.orbitCenter, orbitCenter.x, orbitCenter.y);
    gl.uniform1f(fieldUniforms.orbitRadius, orbitRadius);
    gl.uniform1f(fieldUniforms.angularSpeed, angularSpeed);
    gl.uniform1f(fieldUniforms.waveSpeed, waveSpeed);
    gl.uniform1f(fieldUniforms.arrowScale, arrowScale);
    gl.uniform1f(fieldUniforms.coulombStrength, coulombStrength);
    gl.uniform1f(fieldUniforms.radiationStrength, radiationStrength);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, numInstances);

    gl.useProgram(chargeProgram);
    gl.bindVertexArray(null);
    gl.uniform2f(chargeUniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(chargeUniforms.time, timeSeconds);
    gl.uniform2f(chargeUniforms.orbitCenter, orbitCenter.x, orbitCenter.y);
    gl.uniform1f(chargeUniforms.orbitRadius, orbitRadius);
    gl.uniform1f(chargeUniforms.angularSpeed, angularSpeed);
    gl.uniform1f(chargeUniforms.pointSize, chargePointSize);
    gl.drawArrays(gl.POINTS, 0, 1);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
