class GrayScale {
    constructor ( scene, source ) {     
        this._texture = new THREE.VideoTexture( source );
        this._scene = scene;
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

        const geometry = new THREE.PlaneGeometry(1,1,1,1);
        const mesh = new THREE.Mesh( geometry, shader_material );
        this._scene.add( mesh );
    }

}
