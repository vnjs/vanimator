"use strict";

const THREE = require('three');

/**
 * Break faces with edges longer than maxEdgeLength
 * - not recursive
 *
 * @author alteredq / http://alteredqualia.com/
 */

function TessellateModifier( maxEdgeLength ) {

    function modify( geometry ) {

        let edge;

        let faces = [];
        let faceVertexUvs = [];
        let maxEdgeLengthSquared = maxEdgeLength * maxEdgeLength;

        for ( let i = 0, il = geometry.faceVertexUvs.length; i < il; i++ ) {

            faceVertexUvs[ i ] = [];

        }

        for ( let i = 0, il = geometry.faces.length; i < il; i++ ) {

            let face = geometry.faces[ i ];

            if ( face instanceof THREE.Face3 ) {

                let a = face.a;
                let b = face.b;
                let c = face.c;

                let va = geometry.vertices[ a ];
                let vb = geometry.vertices[ b ];
                let vc = geometry.vertices[ c ];

                let dab = va.distanceToSquared( vb );
                let dbc = vb.distanceToSquared( vc );
                let dac = va.distanceToSquared( vc );

                if ( dab > maxEdgeLengthSquared || dbc > maxEdgeLengthSquared || dac > maxEdgeLengthSquared ) {

                    let m = geometry.vertices.length;
                    let vm;

                    let triA = face.clone();
                    let triB = face.clone();

                    if ( dab >= dbc && dab >= dac ) {

                        vm = va.clone();
                        vm.lerp( vb, 0.5 );

                        triA.a = a;
                        triA.b = m;
                        triA.c = c;

                        triB.a = m;
                        triB.b = b;
                        triB.c = c;

                        if ( face.vertexNormals.length === 3 ) {

                            let vnm = face.vertexNormals[ 0 ].clone();
                            vnm.lerp( face.vertexNormals[ 1 ], 0.5 );

                            triA.vertexNormals[ 1 ].copy( vnm );
                            triB.vertexNormals[ 0 ].copy( vnm );

                        }

                        if ( face.vertexColors.length === 3 ) {

                            let vcm = face.vertexColors[ 0 ].clone();
                            vcm.lerp( face.vertexColors[ 1 ], 0.5 );

                            triA.vertexColors[ 1 ].copy( vcm );
                            triB.vertexColors[ 0 ].copy( vcm );

                        }

                        edge = 0;

                    }
                    else if ( dbc >= dab && dbc >= dac ) {

                        vm = vb.clone();
                        vm.lerp( vc, 0.5 );

                        triA.a = a;
                        triA.b = b;
                        triA.c = m;

                        triB.a = m;
                        triB.b = c;
                        triB.c = a;

                        if ( face.vertexNormals.length === 3 ) {

                            let vnm = face.vertexNormals[ 1 ].clone();
                            vnm.lerp( face.vertexNormals[ 2 ], 0.5 );

                            triA.vertexNormals[ 2 ].copy( vnm );

                            triB.vertexNormals[ 0 ].copy( vnm );
                            triB.vertexNormals[ 1 ].copy( face.vertexNormals[ 2 ] );
                            triB.vertexNormals[ 2 ].copy( face.vertexNormals[ 0 ] );

                        }

                        if ( face.vertexColors.length === 3 ) {

                            let vcm = face.vertexColors[ 1 ].clone();
                            vcm.lerp( face.vertexColors[ 2 ], 0.5 );

                            triA.vertexColors[ 2 ].copy( vcm );

                            triB.vertexColors[ 0 ].copy( vcm );
                            triB.vertexColors[ 1 ].copy( face.vertexColors[ 2 ] );
                            triB.vertexColors[ 2 ].copy( face.vertexColors[ 0 ] );

                        }

                        edge = 1;

                    }
                    else {

                        vm = va.clone();
                        vm.lerp( vc, 0.5 );

                        triA.a = a;
                        triA.b = b;
                        triA.c = m;

                        triB.a = m;
                        triB.b = b;
                        triB.c = c;

                        if ( face.vertexNormals.length === 3 ) {

                            let vnm = face.vertexNormals[ 0 ].clone();
                            vnm.lerp( face.vertexNormals[ 2 ], 0.5 );

                            triA.vertexNormals[ 2 ].copy( vnm );
                            triB.vertexNormals[ 0 ].copy( vnm );

                        }

                        if ( face.vertexColors.length === 3 ) {

                            let vcm = face.vertexColors[ 0 ].clone();
                            vcm.lerp( face.vertexColors[ 2 ], 0.5 );

                            triA.vertexColors[ 2 ].copy( vcm );
                            triB.vertexColors[ 0 ].copy( vcm );

                        }

                        edge = 2;

                    }

                    faces.push( triA, triB );
                    geometry.vertices.push( vm );

                    for ( let j = 0, jl = geometry.faceVertexUvs.length; j < jl; j++ ) {

                        if ( geometry.faceVertexUvs[ j ].length ) {

                            let uvs = geometry.faceVertexUvs[ j ][ i ];

                            let uvA = uvs[ 0 ];
                            let uvB = uvs[ 1 ];
                            let uvC = uvs[ 2 ];

                            let uvsTriA;
                            let uvsTriB;

                            // AB

                            if ( edge === 0 ) {

                                let uvM = uvA.clone();
                                uvM.lerp( uvB, 0.5 );

                                uvsTriA = [ uvA.clone(), uvM.clone(), uvC.clone() ];
                                uvsTriB = [ uvM.clone(), uvB.clone(), uvC.clone() ];

                                // BC

                            }
                            else if ( edge === 1 ) {

                                let uvM = uvB.clone();
                                uvM.lerp( uvC, 0.5 );

                                uvsTriA = [ uvA.clone(), uvB.clone(), uvM.clone() ];
                                uvsTriB = [ uvM.clone(), uvC.clone(), uvA.clone() ];

                                // AC

                            }
                            else {

                                let uvM = uvA.clone();
                                uvM.lerp( uvC, 0.5 );

                                uvsTriA = [ uvA.clone(), uvB.clone(), uvM.clone() ];
                                uvsTriB = [ uvM.clone(), uvB.clone(), uvC.clone() ];

                            }

                            faceVertexUvs[ j ].push( uvsTriA, uvsTriB );

                        }

                    }

                }
                else {

                    faces.push( face );

                    for ( let j = 0, jl = geometry.faceVertexUvs.length; j < jl; j++ ) {

                        faceVertexUvs[ j ].push( geometry.faceVertexUvs[ j ][ i ] );

                    }

                }

            }

        }

        geometry.faces = faces;
        geometry.faceVertexUvs = faceVertexUvs;

    }



    return {
        modify
    };

}

module.exports = TessellateModifier;
