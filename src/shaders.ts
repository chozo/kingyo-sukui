// 共通のGLSL関数（ノイズ・コースティクス）

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y);
}
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
`;

// セル境界を光の筋として使う、揺らぐコースティクス
export const CAUSTIC_GLSL = /* glsl */ `
float causticCell(vec2 p, float t){
  vec2 i=floor(p), f=fract(p); float d1=8., d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y)); vec2 o=hash22(i+g);
    o=.5+.42*sin(t+6.2831*o);
    float d=length(g+o-f);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }
  }
  return d2-d1;
}
float caustic(vec2 p, float t){
  p += .35*vec2(vnoise(p*.7+t*.15), vnoise(p*.7-t*.13+5.));
  float a=causticCell(p, t*.9);
  float b=causticCell(p*1.37+vec2(3.1,1.7), t*1.15);
  return pow(1.-smoothstep(0.,.22,a),2.)*.65 + pow(1.-smoothstep(0.,.18,b),2.)*.45;
}
`;
