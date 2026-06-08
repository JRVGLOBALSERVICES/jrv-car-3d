'use client';

import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';
import { wrapEffect } from '@react-three/postprocessing';

// Color-grade pass ported from the verified Blender preset: saturation lift,
// shadow/highlight split-tone, vignette and film grain. Runs as a fullscreen
// effect inside the EffectComposer (AgX tonemap handled by <ToneMapping/>).
const frag = /* glsl */ `
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb;
  float l = luma(c);
  c = mix(vec3(l), c, 1.0 + uSaturation);
  float lum = clamp(l, 0.0, 1.0);
  c += uShadowTint * (1.0 - lum) + uHighTint * lum;
  float d = distance(uv, vec2(0.5));
  c *= 1.0 - uVignette * smoothstep(0.30, 0.95, d);
  float n = fract(sin(dot(uv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uGrain;
  outputColor = vec4(c, inputColor.a);
}
`;

class ColorGradeImpl extends Effect {
  constructor({ saturation = 0.2, vignette = 0.45, grain = 0.025, shadowTint = [0, 0, 0], highTint = [0, 0, 0] } = {}) {
    super('ColorGrade', frag, {
      uniforms: new Map([
        ['uSaturation', new Uniform(saturation)],
        ['uVignette', new Uniform(vignette)],
        ['uGrain', new Uniform(grain)],
        ['uTime', new Uniform(0)],
        ['uShadowTint', new Uniform(new Vector3(...shadowTint))],
        ['uHighTint', new Uniform(new Vector3(...highTint))],
      ]),
    });
  }

  update(_renderer, _inputBuffer, deltaTime) {
    this.uniforms.get('uTime').value += deltaTime;
  }
}

export const ColorGrade = wrapEffect(ColorGradeImpl);
