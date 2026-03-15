export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error('Failed to create shader.');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const errorMessage = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error.';
        gl.deleteShader(shader);
        throw new Error(errorMessage);
    }

    return shader;
}

export function createProgram(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
): WebGLProgram {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) {
        throw new Error('Failed to create shader program.');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const errorMessage = gl.getProgramInfoLog(program) ?? 'Unknown program link error.';
        gl.deleteProgram(program);
        throw new Error(errorMessage);
    }

    return program;
}

export function requireAttribLocation(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
): number {
    const location = gl.getAttribLocation(program, name);
    if (location < 0) {
        throw new Error(`Attribute not found: ${name}`);
    }
    return location;
}

export function requireUniformLocation(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
): WebGLUniformLocation {
    const location = gl.getUniformLocation(program, name);
    if (!location) {
        throw new Error(`Uniform not found: ${name}`);
    }
    return location;
}