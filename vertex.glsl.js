export default `#version 300 es

in vec3 position;
out vec4 vColor;
uniform mat4 modelview;
uniform mat4 projection;
uniform float heightScale;

void main() {
  vec3 scaledPos = vec3(position.x, position.y * heightScale, position.z);
  vec3 positionTransformed = 0.5 * scaledPos + vec3(0.5, 0.5, 0.5);
  positionTransformed = pow(positionTransformed, vec3(1.3));
  vColor = vec4(positionTransformed, 1.0);
  gl_Position = projection * modelview * vec4(scaledPos, 1.0);
}
`;