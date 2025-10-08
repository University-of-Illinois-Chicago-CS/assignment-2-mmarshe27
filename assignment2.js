import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;
var uniformHeightScaleLoc = null;

var heightScale = 1.0;
var projectionMode = 'perspective';

var camera = {
    yaw: 0,
    pitch: 0,
    zoom: 5,
    panX: 0,
    panY: 0
};

function processImage(img)
{
    // draw the image into an off-screen canvas
    var off = document.createElement('canvas');

    var sw = img.width, sh = img.height;
    off.width = sw; off.height = sh;

    var ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, sw, sh);

    // read back the image pixel data
    var imgd = ctx.getImageData(0,0,sw,sh);
    var px = imgd.data;

    // create a an array will hold the height value
    var heightArray = new Float32Array(sw * sh);

    // loop through the image, rows then columns
    for (var y=0;y<sh;y++)
    {
        for (var x=0;x<sw;x++)
        {
            // offset in the image buffer
            var i = (y*sw + x)*4;

            // read the RGB pixel value
            var r = px[i+0], g = px[i+1], b = px[i+2];

            // convert to greyscale value between 0 and 1
            var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

            // store in array
            heightArray[y*sw + x] = lum;
        }
    }

    return {
        data: heightArray,
        width: sw,
        height: sh
    };
}

window.loadImageFile = function(event)
{

    var f = event.target.files && event.target.files[0];
    if (!f) return;

    // create a FileReader to read the image file
    var reader = new FileReader();
    reader.onload = function()
    {
        // create an internal Image object to hold the image into memory
        var img = new Image();
        img.onload = function()
        {
            // heightmapData is globally defined
            heightmapData = processImage(img);

            console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);
            var terrain = createTerrainMesh(heightmapData);
            uploadTerrainMesh(terrain);
        };
        img.onerror = function()
        {
            console.error("Invalid image file.");
            alert("The selected file could not be loaded as an image.");
        };

        // the source of the image is the data load from the file
        img.src = reader.result;
    };
    reader.readAsDataURL(f);
}

function createTerrainMesh(heightmapData) {
    const w = heightmapData.width;
    const h = heightmapData.height;
    const data = heightmapData.data;

    const positions = [];

    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const i0 = y * w + x;
            const i1 = y * w + (x + 1);
            const i2 = (y + 1) * w + x;
            const i3 = (y + 1) * w + (x + 1);

            const fx = x / (w - 1) - 0.5;
            const fz = y / (h - 1) - 0.5;
            const fx1 = (x + 1) / (w - 1) - 0.5;
            const fz1 = (y + 1) / (h - 1) - 0.5;

            // heights (Y-axis)
            const y0 = data[i0];
            const y1 = data[i1];
            const y2 = data[i2];
            const y3 = data[i3];

            positions.push(
                fx,   y0, fz,
                fx1,  y1, fz,
                fx,   y2, fz1
            );

            positions.push(
                fx1,  y1, fz,
                fx1,  y3, fz1,
                fx,   y2, fz1
            );
        }
    }

    return { positions: new Float32Array(positions) };
}

function uploadTerrainMesh(mesh) {
    vertexCount = mesh.positions.length / 3;

    const posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, mesh.positions);

    // Reuse the same shader program
    gl.useProgram(program);
    const posAttribLoc = gl.getAttribLocation(program, "position");

    vao = createVAO(gl, posAttribLoc, posBuffer);
}

function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}
function draw()
{
    var fovRadians = 70 * Math.PI / 180;
    var aspectRatio = gl.canvas.width / gl.canvas.height;
    var nearClip = 0.001;
    var farClip = 100.0;

    let projectionMatrix;
    if (projectionMode === 'perspective') {
        projectionMatrix = perspectiveMatrix(fovRadians, aspectRatio, nearClip, farClip);
    } else {
        const scale = camera.zoom * 0.5;
        projectionMatrix = orthographicMatrix(-scale, scale, -scale, scale, nearClip, farClip);
    }

    // eye and target
    var eye = [
        Math.sin(camera.yaw) * camera.zoom,
        camera.zoom * Math.sin(camera.pitch),
        Math.cos(camera.yaw) * camera.zoom
    ];

    var target = [camera.panX, 0, camera.panY];

    var modelMatrix = identityMatrix();
    var viewMatrix = setupViewMatrix(eye, target);

    var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);

    // enable depth testing
    gl.enable(gl.DEPTH_TEST);

    // disable face culling to render both sides of the triangles
    gl.disable(gl.CULL_FACE);

    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);

    // update modelview and projection matrices to GPU as uniforms
    gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
    gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

    gl.uniform1f(uniformHeightScaleLoc, heightScale);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    requestAnimationFrame(draw);
}

function createBox()
{
    function transformTriangle(triangle, matrix) {
        var v1 = [triangle[0], triangle[1], triangle[2], 1];
        var v2 = [triangle[3], triangle[4], triangle[5], 1];
        var v3 = [triangle[6], triangle[7], triangle[8], 1];

        var newV1 = multiplyMatrixVector(matrix, v1);
        var newV2 = multiplyMatrixVector(matrix, v2);
        var newV3 = multiplyMatrixVector(matrix, v3);

        return [
            newV1[0], newV1[1], newV1[2],
            newV2[0], newV2[1], newV2[2],
            newV3[0], newV3[1], newV3[2]
        ];
    }

    var box = [];

    var triangle1 = [
        -1, -1, +1,
        -1, +1, +1,
        +1, -1, +1,
    ];
    box.push(...triangle1)

    var triangle2 = [
        +1, -1, +1,
        -1, +1, +1,
        +1, +1, +1
    ];
    box.push(...triangle2);

    // 3 rotations of the above face
    for (var i=1; i<=3; i++)
    {
        var yAngle = i* (90 * Math.PI / 180);
        var yRotMat = rotateYMatrix(yAngle);

        var newT1 = transformTriangle(triangle1, yRotMat);
        var newT2 = transformTriangle(triangle2, yRotMat);

        box.push(...newT1);
        box.push(...newT2);
    }

    // a rotation to provide the base of the box
    var xRotMat = rotateXMatrix(90 * Math.PI / 180);
    box.push(...transformTriangle(triangle1, xRotMat));
    box.push(...transformTriangle(triangle2, xRotMat));


    return {
        positions: box
    };

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
    isDragging = false;

    canvas.addEventListener("mousedown", function (e)
    {
        if (e.button === 0) {
            console.log("Left button pressed");
            leftMouse = true;
        } else if (e.button === 2) {
            console.log("Right button pressed");
            leftMouse = false;
        }

        isDragging = true;
        startX = e.offsetX;
        startY = e.offsetY;
    });

    canvas.addEventListener("contextmenu", function(e)  {
        e.preventDefault(); // disables the default right-click menu
    });


    canvas.addEventListener("wheel", function(e)  {
        e.preventDefault();
        camera.zoom += e.deltaY * 0.005;
        camera.zoom = Math.min(Math.max(0.1, camera.zoom), 5.0);
    });

    document.addEventListener("mousemove", function (e) {
        if (!isDragging) return;
        var currentX = e.offsetX;
        var currentY = e.offsetY;

        var deltaX = currentX - startX;
        var deltaY = currentY - startY;

        if (leftMouse) {
            camera.yaw += deltaX * 0.01;
            camera.pitch += deltaY * 0.01;
        } else {
            camera.panX += deltaX * 0.005;
            camera.panY -= deltaY * 0.005;
        }

        startX = currentX;
        startY = currentY;
    });

    document.addEventListener("mouseup", function () {
        isDragging = false;
    });

    document.addEventListener("mouseleave", () => {
        isDragging = false;
    });
}

function initialize()
{
    var canvas = document.querySelector("#glcanvas");
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    gl = canvas.getContext("webgl2");

    // add mouse callbacks
    addMouseCallback(canvas);

    var box = createBox();
    vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
    console.log(box);

    // create buffers to put in box
    var boxVertices = new Float32Array(box['positions']);
    var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

    var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
    program = createProgram(gl, vertexShader, fragmentShader);

    // attributes (per vertex)
    var posAttribLoc = gl.getAttribLocation(program, "position");

    // uniforms
    uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
    uniformProjectionLoc = gl.getUniformLocation(program, 'projection');
    uniformHeightScaleLoc = gl.getUniformLocation(program, 'heightScale');

    vao = createVAO(gl,
        // positions
        posAttribLoc, posBuffer,

        // normals (unused in this assignments)
        null, null,

        // colors (not needed--computed by shader)
        null, null
    );

    window.requestAnimationFrame(draw);
}

window.onload = initialize();

window.addEventListener('DOMContentLoaded', () => {
    const heightSlider = document.getElementById('height');
    const zoomSlider = document.getElementById('scale');
    const rotationSlider = document.getElementById('rotation');
    const projectionSelect = document.getElementById('projectionMode');

    heightSlider.addEventListener('input', (e) => {
        heightScale = parseFloat(e.target.value) / 50.0;
    });

    zoomSlider.addEventListener('input', (e) => {
        camera.zoom = 3 - parseFloat(e.target.value) / 100.0;
    });

    rotationSlider.addEventListener('input', (e) => {
        camera.yaw = parseFloat(e.target.value) * Math.PI / 180.0;
    });

    projectionSelect.addEventListener('change', (e) => {
        projectionMode = e.target.value;
    });
});