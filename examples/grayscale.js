class GrayScale {
    constructor ( scene, source, camera, renderer, rtWidth, rtHeight ) {  
        this.webglRenderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
        this.rtCamera = new THREE.OrthographicCamera(-1, 1, -1, 1, -1, 1);
        this.rtCamera.position.z = 2;
        this.rtScene = new THREE.Scene();
        this.rtScene.background = new THREE.Color('red'); 
        this._texture = new THREE.VideoTexture( source );
        this._scene = scene;
        this._camera = camera;
        this._renderer = renderer;
        console.log('grayscale setup');
    }

    getFrame() {
        const shader_material = new THREE.RawShaderMaterial( {

            uniforms: {
        
                flipY: { value: 1.0 },
                u_image: {value: this._texture }
        
            },
        
            vertexShader: 'attribute vec2 position;\
                varying vec2 tex_coords;\
                uniform float flipY;\
                void main(void) {\
                    tex_coords = (position + 1.0) / 2.0;\
                    tex_coords.y = 1.0 - tex_coords.y;\
                    gl_Position = vec4(position * vec2(1, flipY), 0.0, 1.0);\
                }',
        
            fragmentShader: 'precision highp float;\
                uniform sampler2D u_image;\
                varying vec2 tex_coords;\
                const vec3 g = vec3(0.299, 0.587, 0.114);\
                void main(void) {\
                    vec4 color = texture2D(u_image, tex_coords);\
                    float gray = dot(color.rgb, g);\
                    gl_FragColor = vec4(vec3(gray), 1.0);\
                }'
        } );

        const geometry = new THREE.PlaneBufferGeometry(2, 2);
        const mesh = new THREE.Mesh( geometry, shader_material );
        this.rtScene.add( mesh );
        this._renderer.setRenderTarget(this.webglRenderTarget);
        this._renderer.render(this.rtScene, this.rtCamera);
        this._renderer.setRenderTarget(null);
    }

    getImageData(textureWidth, textureHeight){
        const gl = this._renderer.getContext();
        let pixels = new Uint8Array(textureWidth * textureHeight * 4);
        gl.readPixels(0, 0, textureWidth, textureHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let image = new ImageData(textureWidth, textureHeight);
        //copy texture data to Image data where format is RGBA
        let size = textureWidth * textureHeight * 4;
        let j = 0;
        for (let i = 0; i < size; i+=4) {
           image.data[j] = pixels[i];
           j++;
        }
        //console.log(image.data);
        return image.data;
    }

}
