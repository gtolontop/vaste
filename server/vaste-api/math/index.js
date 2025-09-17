/**
 * Vaste API - Math Functions
 */

const { VasteVector3 } = require('../types');

class MathUtils {
    static vec3(x = 0, y = 0, z = 0) {
        return new VasteVector3(x, y, z);
    }

    static distance(pos1, pos2) {
        if (pos1 instanceof VasteVector3 && pos2 instanceof VasteVector3) {
            return pos1.distance(pos2);
        }
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static degToRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    static radToDeg(radians) {
        return radians * (180 / Math.PI);
    }
}

module.exports = { MathUtils };