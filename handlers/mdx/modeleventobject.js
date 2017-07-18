import MdxModelParticle2Emitter from "./modelparticle2emitter";
import { vec2 } from "gl-matrix";

/**
 * @constructor
 * @param {MdxModel} model
 * @param {MdxParserEventObjectEmitter} emitter
 */
function MdxModelEventObject(model, emitter) {
    let env = model.env,
        node = model.nodes[emitter.node.index],
        name = node.name,
        type = name.substring(0, 3),
        id = name.substring(4);

    // Same thing
    if (type === "FPT") {
        type = "SPL";
    }

    this.ready = false;
    this.model = model;
    this.emitter = emitter;
    this.node = node;
    this.type = type;
    this.id = id;

    this.internalResource = null;

    this.tracks = emitter.tracks;
    this.ready = false;
    this.globalSequence = null;
    this.defval = vec2.create();

    let globalSequenceId = emitter.globalSequenceId;
    if (globalSequenceId !== -1) {
        this.globalSequence = model.globalSequences[globalSequenceId];
    }

    let path = this.typeToSlk[type];

    if (path) {
        let slk = env.load(path, model.pathSolver);

        if (slk.loaded) {
            this.initialize(slk.map[id]);
        } else {
            // Promise that there is a future load that the code cannot know about yet, so Viewer.whenAllLoaded() isn't called prematurely.
            let promise = env.makePromise();

            slk.whenLoaded(() => {
                this.initialize(slk.map[id]);

                // Resolve the promise.
                promise.resolve();
            });
        }
    }
}

MdxModelEventObject.prototype = {
    typeToSlk: {
        "SPN": "Splats/SpawnData.slk",
        "SPL": "Splats/SplatData.slk",
        "UBR": "Splats/UberSplatData.slk"
    },

    initialize(row) {
        if (row) {
            let type = this.type,
                model = this.model;

            if (type === "SPN") {
                this.internalResource = model.env.load(row.Model.replace(".mdl", ".mdx"), model.pathSolver);
            } else if (type === "SPL") {
                this.intervals = [
                [row.UVLifespanStart, row.UVLifespanEnd, row.LifespanRepeat],
                [row.UVDecayStart, row.UVDecayEnd, row.DecayRepeat]
                ];

                this.internalResource = model.env.load("replaceabletextures/splats/" + row.file + ".blp", model.pathSolver);
                this.dimensions = [row.Columns, row.Rows];

                this.scale = row.Scale;
                this.colors = [[row.StartR, row.StartG, row.StartB, row.StartA], [row.MiddleR, row.MiddleG, row.MiddleB, row.MiddleA], [row.EndR, row.EndG, row.EndB, row.EndA]];

                this.intervalTimes = [row.Lifespan, row.Decay];
                this.lifespan = row.Lifespan + row.Decay;

                this.selectFilterMode(row.BlendMode);
            } else if (type === "UBR") {
                this.internalResource = model.env.load("replaceabletextures/splats/" + row.file + ".blp", model.pathSolver);
                this.dimensions = [1, 1];

                this.scale = row.Scale;
                this.colors = [[row.StartR, row.StartG, row.StartB, row.StartA], [row.MiddleR, row.MiddleG, row.MiddleB, row.MiddleA], [row.EndR, row.EndG, row.EndB, row.EndA]];

                this.intervalTimes = [
                        row.BirthTime,
                        row.PauseTime,
                        row.Decay
                ];

                this.lifespan = row.BirthTime + row.PauseTime + row.Decay;

                this.selectFilterMode(row.BlendMode);
            }

            this.ready = true;
        }
    },

    selectFilterMode: MdxModelParticle2Emitter.prototype.selectFilterMode,

    getValue(instance) {
        if (this.globalSequence) {
            var globalSequence = this.globalSequence;

            return this.getValueAtTime(instance.counter % globalSequence, 0, globalSequence);
        } else if (instance.sequence !== -1) {
            var interval = this.model.sequences[instance.sequence].interval;

            return this.getValueAtTime(instance.frame, interval[0], interval[1]);
        } else {
            return this.defval;
        }
    },

    getValueAtTime(frame, start, end) {
        var out = vec2.heap,
            tracks = this.tracks;

        if (frame < start || frame > end) {
            out[0] = 0;
            out[1] = 0;
            return out;
        }

        for (var i = tracks.length - 1; i > -1; i--) {
            if (tracks[i] < start) {
                out[0] = 0;
                out[1] = i;
                return out;
            } else if (tracks[i] <= frame) {
                out[0] = 1;
                out[1] = i;
                return out;
            }
        }

        out[0] = 0;
        out[1] = 0;
        return out;
    }
};

export default MdxModelEventObject;
