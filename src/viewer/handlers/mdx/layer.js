import {VEC3_ZERO, VEC3_ONE, QUAT_DEFAULT} from '../../../common/gl-matrix-addon';
import stringHash from '../../../common/stringhash';
import unique from '../../../common/arrayunique';
import AnimatedObject from './animatedobject';
import {layerFilterMode} from './filtermode';

/**
 * An MDX layer.
 */
export default class Layer extends AnimatedObject {
  /**
   * @param {Model} model
   * @param {ModelViewer.parser.mdlx.Layer} layer
   * @param {number} layerId
   * @param {number} priorityPlane
   */
  constructor(model, layer, layerId, priorityPlane) {
    let filterMode = layer.filterMode;
    let textureAnimationId = layer.textureAnimationId;
    let gl = model.viewer.gl;

    super(model, layer);

    this.index = layerId;
    this.priorityPlane = priorityPlane;
    this.filterMode = filterMode;
    this.textureId = layer.textureId;
    this.coordId = layer.coordId;
    this.alpha = layer.alpha;

    let flags = layer.flags;

    this.unshaded = flags & 0x1;
    this.sphereEnvironmentMap = flags & 0x2;
    this.twoSided = flags & 0x10;
    this.unfogged = flags & 0x20;
    this.noDepthTest = flags & 0x40;
    this.noDepthSet = flags & 0x80;

    this.depthMaskValue = (filterMode === 0 || filterMode === 1) ? 1 : 0;
    this.alphaTestValue = (filterMode === 1) ? 1 : 0;

    this.blendSrc = 0;
    this.blendDst = 0;
    this.blended = (filterMode > 1) ? true : false;

    if (this.blended) {
      [this.blendSrc, this.blendDst] = layerFilterMode(filterMode, gl);
    }

    this.uvDivisor = new Float32Array([1, 1]);

    if (textureAnimationId !== -1) {
      let textureAnimation = model.textureAnimations[textureAnimationId];

      if (textureAnimation) {
        this.textureAnimation = textureAnimation;
      }
    }

    let variants = {
      alpha: [],
      slot: [],
      translation: [],
      rotation: [],
      scale: [],
    };

    let hasSlotAnim = false;
    let hasTranslationAnim = false;
    let hasRotationAnim = false;
    let hasScaleAnim = false;

    for (let i = 0, l = model.sequences.length; i < l; i++) {
      let alpha = this.isAlphaVariant(i);
      let slot = this.isTextureIdVariant(i);
      let translation = this.isTranslationVariant(i);
      let rotation = this.isRotationVariant(i);
      let scale = this.isScaleVariant(i);

      variants.alpha[i] = alpha;
      variants.slot[i] = slot;
      variants.translation[i] = translation;
      variants.rotation[i] = rotation;
      variants.scale[i] = scale;

      hasSlotAnim = hasSlotAnim || slot;
      hasTranslationAnim = hasTranslationAnim || translation;
      hasRotationAnim = hasRotationAnim || rotation;
      hasScaleAnim = hasScaleAnim || scale;
    }

    this.variants = variants;
    this.hasSlotAnim = hasSlotAnim;
    this.hasTranslationAnim = hasTranslationAnim;
    this.hasRotationAnim = hasRotationAnim;
    this.hasScaleAnim = hasScaleAnim;

    // Handle sprite animations
    if (this.animations.KMTF) {
      // Get all unique texture IDs used by this layer
      let textureIds = unique(this.animations.KMTF.getValues());

      if (textureIds.length > 1) {
        let hash = stringHash(textureIds.join(''));
        let textures = [];

        // Grab all of the textures
        for (let i = 0, l = textureIds.length; i < l; i++) {
          textures[i] = model.textures[textureIds[i]];
        }

        let atlas = model.viewer.loadTextureAtlas(hash, textures);

        atlas.texture.whenLoaded()
          .then(() => {
            model.textures.push(atlas.texture);
            model.textureOptions.push({repeatS: true, repeatT: true});

            this.textureId = model.textures.length - 1;
            this.uvDivisor.set([atlas.columns, atlas.rows]);
          });
      }
    }
  }

  /**
   * @param {ShaderProgram} shader
   */
  bind(shader) {
    let gl = this.model.viewer.gl;

    gl.uniform1f(shader.uniforms.get('u_alphaTest'), this.alphaTestValue);

    if (this.blended) {
      gl.enable(gl.BLEND);
      gl.blendFunc(this.blendSrc, this.blendDst);
    } else {
      gl.disable(gl.BLEND);
    }

    if (this.twoSided) {
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
    }

    if (this.noDepthTest) {
      gl.disable(gl.DEPTH_TEST);
    } else {
      gl.enable(gl.DEPTH_TEST);
    }

    if (this.noDepthSet) {
      gl.depthMask(0);
    } else {
      gl.depthMask(this.depthMaskValue);
    }
  }

  /**
   * @param {ModelInstance} instance
   * @return {number}
   */
  getAlpha(instance) {
    return this.getValue('KMTA', instance, this.alpha);
  }


  /**
   * @param {ModelInstance} instance
   * @return {number}
   */
  getTextureId(instance) {
    return this.getValue('KMTF', instance, this.textureId);
    // / TODO: map the returned slot to a texture atlas slot if one exists.
  }

  /**
  * @param {ModelInstance} instance
  * @return {vec3}
  */
  getTranslation(instance) {
    if (this.textureAnimation) {
      return this.textureAnimation.getTranslation(instance);
    }

    return VEC3_ZERO;
  }

  /**
   * @param {ModelInstance} instance
   * @return {quat}
   */
  getRotation(instance) {
    if (this.textureAnimation) {
      return this.textureAnimation.getRotation(instance);
    }

    return QUAT_DEFAULT;
  }

  /**
   * @param {ModelInstance} instance
   * @return {vec3}
   */
  getScale(instance) {
    if (this.textureAnimation) {
      return this.textureAnimation.getScale(instance);
    }

    return VEC3_ONE;
  }

  /**
   * @param {number} sequence
   * @return {boolean}
   */
  isAlphaVariant(sequence) {
    return this.isVariant('KMTA', sequence);
  }

  /**
   * @param {number} sequence
   * @return {boolean}
   */
  isTextureIdVariant(sequence) {
    return this.isVariant('KMTF', sequence);
  }

  /**
   * @param {number} sequence
   * @return {boolean}
   */
  isTranslationVariant(sequence) {
    if (this.textureAnimation) {
      return this.textureAnimation.isTranslationVariant(sequence);
    } else {
      return false;
    }
  }

  /**
   * @param {number} sequence
   * @return {boolean}
   */
  isRotationVariant(sequence) {
    if (this.textureAnimation) {
      return this.textureAnimation.isRotationVariant(sequence);
    } else {
      return false;
    }
  }

  /**
   * @param {number} sequence
   * @return {boolean}
   */
  isScaleVariant(sequence) {
    if (this.textureAnimation) {
      return this.textureAnimation.isScaleVariant(sequence);
    } else {
      return false;
    }
  }
}
