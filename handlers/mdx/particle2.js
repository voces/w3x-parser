import { vec3, vec4, quat } from "gl-matrix";
import { encodeFloat3 } from "../../src/common";

/**
 * @constructor
 * @param {MdxParticle2Emitter} emitter
 */
function MdxParticle2(emitter) {
    this.emitter = emitter;
    this.instance = null;
    this.health = 0;
    this.head = true;
    this.location = vec3.create();
    this.worldLocation = vec3.create();
    this.velocity = vec3.create();
    this.gravity = 0;
    this.scale = 1;
    this.index = 0;
    this.nodeScale = vec3.create();

    this.color = new Uint8Array(4);
    this.vertices = new Float32Array(12);
    this.lta = 0;
    this.lba = 0;
    this.rta = 0;
    this.rba = 0;
    this.rgb = 0;
}

MdxParticle2.prototype = {
    reset(emitterView, isHead) {
        let modelObject = this.emitter.modelObject,
            node = emitterView.instance.skeleton.nodes[modelObject.node.index],
            pivot = node.pivot,
            scale = node.worldScale,
            width = emitterView.getWidth() * 0.5,
            length = emitterView.getLength() * 0.5,
            latitude = Math.toRad(emitterView.getLatitude()),
            variation = emitterView.getVariation(),
            location = this.location,
            velocity = this.velocity,
            q = quat.heap;

        this.instance = emitterView.instance;
        this.node = node;
        this.health = modelObject.lifespan;
        this.head = isHead;
        this.gravity = emitterView.getGravity() * scale[2];
        this.scale = 1;
        this.index = 0;

        vec4.copy(this.color, modelObject.colors[0]);
        vec3.copy(this.nodeScale, scale);

        // Local location
        location[0] = pivot[0] + Math.randomRange(-width, width);
        location[1] = pivot[1];
        location[2] = pivot[2] + Math.randomRange(-length, length);

        // World location
        if (!modelObject.modelSpace) {
            vec3.transformMat4(location, location, node.worldMatrix);
        }

        // Local rotation
        quat.identity(q);
        quat.rotateZ(q, q, Math.PI / 2);
        quat.rotateY(q, q, Math.randomRange(-latitude, latitude));

        // World rotation
        if (!modelObject.modelSpace) {
            quat.mul(q, node.worldRotation, q);
        }

        // Apply the rotation
        vec3.transformQuat(velocity, vec3.UNIT_Z, q);

        // Apply speed
        vec3.scale(velocity, velocity, emitterView.getSpeed() + Math.randomRange(-variation, variation));

        // Apply the parent's scale
        vec3.mul(velocity, velocity, scale);

        if (!isHead) {
            var tailLength = modelObject.tailLength * 0.5;

            vec3.scaleAndAdd(location, velocity, -tailLength);
        }
    },

    update(scene) {
        let modelObject = this.emitter.modelObject,
            dt = modelObject.model.env.frameTime * 0.001,
            location = this.location,
            worldLocation = this.worldLocation,
            velocity = this.velocity;

        this.health -= dt;

        velocity[2] -= this.gravity * dt;

        vec3.scaleAndAdd(location, location, velocity, dt);

        if (modelObject.modelSpace) {
            vec3.transformMat4(worldLocation, location, this.node.worldMatrix);
        } else {
            vec3.copy(worldLocation, location);
        }

        let lifeFactor = (modelObject.lifespan - this.health) / modelObject.lifespan,
            timeMiddle = modelObject.timeMiddle,
            intervals = modelObject.intervals,
            factor,
            firstColor,
            head = this.head,
            interval;

        if (lifeFactor < timeMiddle) {
            factor = lifeFactor / timeMiddle;

            firstColor = 0;

            if (head) {
                interval = intervals[0];
            } else {
                interval = intervals[1];
            }
        } else {
            factor = (lifeFactor - timeMiddle) / (1 - timeMiddle);

            firstColor = 1;

            if (head) {
                interval = intervals[2];
            } else {
                interval = intervals[3];
            }
        }

        factor = Math.min(factor, 1);

        let scaling = modelObject.scaling,
            colors = modelObject.colors,
            color = this.color,
            scale = Math.lerp(scaling[firstColor], scaling[firstColor + 1], factor),
            index = Math.floor(Math.lerp(interval[0], interval[1], factor));

        vec4.lerp(color, colors[firstColor], colors[firstColor + 1], factor);

        let camera = scene.camera,
            vectors;

        // Choose between a default rectangle or billboarded one
        if (modelObject.xYQuad) {
            vectors = camera.vectors;
        } else {
            vectors = camera.billboardedVectors;
        }

        let vertices = this.vertices,
            nodeScale = this.nodeScale,
            px = worldLocation[0],
            py = worldLocation[1],
            pz = worldLocation[2];

        if (head) {
            let pv1 = vectors[0],
                pv2 = vectors[1],
                pv3 = vectors[2],
                pv4 = vectors[3];

            vertices[0] = px + pv1[0] * scale * nodeScale[0];
            vertices[1] = py + pv1[1] * scale * nodeScale[1];
            vertices[2] = pz + pv1[2] * scale * nodeScale[2];
            vertices[3] = px + pv2[0] * scale * nodeScale[0];
            vertices[4] = py + pv2[1] * scale * nodeScale[1];
            vertices[5] = pz + pv2[2] * scale * nodeScale[2];
            vertices[6] = px + pv3[0] * scale * nodeScale[0];
            vertices[7] = py + pv3[1] * scale * nodeScale[1];
            vertices[8] = pz + pv3[2] * scale * nodeScale[2];
            vertices[9] = px + pv4[0] * scale * nodeScale[0];
            vertices[10] = py + pv4[1] * scale * nodeScale[1];
            vertices[11] = pz + pv4[2] * scale * nodeScale[2];
        } else {
            let csx = vectors[4],
                csy = vectors[5],
                csz = vectors[6];

            var tailLength = this.tailLength;
            var offsetx = tailLength * velocity[0];
            var offsety = tailLength * velocity[1];
            var offsetz = tailLength * velocity[2];

            var px2 = px + offsetx;
            var py2 = py + offsety;
            var pz2 = pz + offsetz;

            px -= offsetx;
            py -= offsety;
            pz -= offsetz;

            vertices[0] = px2 - csx[0] * scale * nodeScale[0];
            vertices[1] = py2 - csx[1] * scale * nodeScale[1];
            vertices[2] = pz2 - csx[2] * scale * nodeScale[2];
            vertices[3] = px - csx[0] * scale * nodeScale[0];
            vertices[4] = py - csx[1] * scale * nodeScale[1];
            vertices[5] = pz - csx[2] * scale * nodeScale[2];
            vertices[6] = px + csx[0] * scale * nodeScale[0];
            vertices[7] = py + csx[1] * scale * nodeScale[1];
            vertices[8] = pz + csx[2] * scale * nodeScale[2];
            vertices[9] = px2 + csx[0] * scale * nodeScale[0];
            vertices[10] = py2 + csx[1] * scale * nodeScale[1];
            vertices[11] = pz2 + csx[2] * scale * nodeScale[2];
        }

        let columns = modelObject.dimensions[0],
            left = index % columns,
            top = Math.floor(index / columns),
            right = left + 1,
            bottom = top + 1,
            a = color[3];

        this.lta = encodeFloat3(right, bottom, a);
        this.lba = encodeFloat3(left, bottom, a);
        this.rta = encodeFloat3(right, top, a);
        this.rba = encodeFloat3(left, top, a);
        this.rgb = encodeFloat3(color[0], color[1], color[2]);
    }
};

export default MdxParticle2;
