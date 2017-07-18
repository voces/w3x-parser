import Texture from "../../src/texture";
import { mix } from "../../src/common";

/**
 * @constructor
 * @augments Texture
 * @memberOf NativeTexture
 * @param {ModelViewer} env
 * @param {function(?)} pathSolver
 */
function ImageTexture(env, pathSolver) {
    Texture.call(this, env, pathSolver);
}

ImageTexture.prototype = {
    initialize(src) {
        // src can either be an Image, or an ArrayBuffer, depending on the way it was loaded
        if (src instanceof HTMLImageElement || src instanceof HTMLVideoElement || src instanceof HTMLCanvasElement || src instanceof ImageData) {
            this.loadFromImage(src);

            return true;
        } else if (src instanceof WebGLTexture) {
            this.webglResource = src;

            return true;
        } else {
            let blob = new Blob([src]),
                url = URL.createObjectURL(blob),
                image = new Image();

            image.onload = () => {
                this.loadFromImage(image);

                URL.revokeObjectURL(url);

                this.finalizeLoad();
            };

            image.src = url;
        }
    },

    loadFromImage(image) {
        let gl = this.env.gl;

        let id = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, id);
        this.setParameters(gl.REPEAT, gl.REPEAT, gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);

        this.width = image.width;
        this.height = image.height;
        this.webglResource = id;
    }
};

mix(ImageTexture.prototype, Texture.prototype);

export default ImageTexture;
