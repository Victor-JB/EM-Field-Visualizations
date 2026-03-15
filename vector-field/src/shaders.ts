export const fieldVertexShaderSource = `#version 300 es
    precision highp float;

    in vec2 a_position;
    in vec2 a_offset;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_orbitCenter;
    uniform float u_orbitRadius;
    uniform float u_angularSpeed;
    uniform float u_waveSpeed;
    uniform float u_arrowScale;
    uniform float u_coulombStrength;
    uniform float u_radiationStrength;

    out float v_fieldMag;

    const float EPSILON = 1e-4;

    vec2 chargePosition(float theta) {
        return u_orbitCenter + u_orbitRadius * vec2(cos(theta), sin(theta));
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
        float displayMag = log(1.0 + fieldMag * 11.0);
        float arrowLength = u_arrowScale * max(0.95, 0.72 + displayMag);

        vec2 localArrow = vec2(a_position.x * aspect, a_position.y);
        vec2 rotatedArrow = rotationFromDirection(direction) * (localArrow * arrowLength);
        vec2 finalWorld = centerWorld + rotatedArrow;

        gl_Position = vec4(finalWorld.x / aspect, finalWorld.y, 0.0, 1.0);
    }
`;

export const fieldFragmentShaderSource = `#version 300 es
    precision highp float;

    in float v_fieldMag;
    out vec4 outColor;

    void main() {
        float visibleField = max(v_fieldMag, 0.06);
        float compressed = log(1.0 + visibleField * 12.0);
        float ripple = smoothstep(0.05, 1.6, compressed);
        float glow = smoothstep(0.45, 2.4, compressed);

        vec3 base = vec3(0.22, 0.44, 0.52);
        vec3 low = vec3(0.28, 0.56, 0.66);
        vec3 high = vec3(0.42, 0.94, 1.00);
        vec3 core = vec3(0.90, 0.98, 1.00);

        vec3 color = mix(base, low, ripple);
        color = mix(color, high, glow);
        color = mix(color, core, smoothstep(1.45, 3.1, compressed));

        outColor = vec4(color, 1.0);
    }
`;

export const chargeVertexShaderSource = `#version 300 es
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_orbitCenter;
    uniform float u_orbitRadius;
    uniform float u_angularSpeed;
    uniform float u_pointSize;

    void main() {
        float theta = u_angularSpeed * u_time;
        vec2 chargePos = u_orbitCenter + u_orbitRadius * vec2(cos(theta), sin(theta));
        float aspect = u_resolution.x / u_resolution.y;

        gl_Position = vec4(chargePos.x / aspect, chargePos.y, 0.0, 1.0);
        gl_PointSize = u_pointSize;
    }
`;

export const chargeFragmentShaderSource = `#version 300 es
    precision highp float;

    out vec4 outColor;

    void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float dist = length(centered);

        if (dist > 0.5) {
            discard;
        }

        float core = smoothstep(0.12, 0.0, dist);
        float glow = smoothstep(0.5, 0.08, dist);
        vec3 color = mix(vec3(0.45, 0.90, 1.00), vec3(1.00, 1.00, 1.00), core);
        float alpha = max(core, glow * 0.55);

        outColor = vec4(color, alpha);
    }
`;