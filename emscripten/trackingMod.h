/*
 *  trackingMod.h modified version of ar2Tracking()
 *  from AR2/tracking.c
 *  ARToolKit5
 *
 *  This file is part of ARToolKit.
 *
 *  ARToolKit is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  ARToolKit is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with ARToolKit.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2015 Daqri, LLC.
 *  Copyright 2006-2015 ARToolworks, Inc.
 *
 *  Author(s): Hirokazu Kato, Philip Lamb
 *  Mod. by Walter Perdan @kalwalt
 *
 */
/*!
	@header tracking
	@abstract ARToolKit NFT core routines.
	@discussion
        This header declares essential types and API for the NFT portion of the
        ARToolKit SDK.

        For compile-time per-machine and NFT configuration, see &lt;AR2/config.h&gt;.
    @copyright 2015 Daqri, LLC.
 */

#ifndef __trackingMod_H__
#define __trackingMod_H__
#include <AR/ar.h>
#include <AR/icp.h>
#include <AR2/config.h>
#include <AR2/featureSet.h>
#include <AR2/template.h>
#include <AR2/marker.h>
#include <AR2/tracking.h>

#define    AR2_TRACKING_6DOF                   1
#define    AR2_TRACKING_HOMOGRAPHY             2

#ifdef __cplusplus
extern "C" {
#endif

int ar2Tracking2dSub ( AR2HandleT *handle, AR2SurfaceSetT *surfaceSet, AR2TemplateCandidateT *candidate,
                              ARUint8 *dataPtr, ARUint8 *mfImage, AR2TemplateT **templ,
                              AR2Tracking2DResultT *result );

AR2HandleT *ar2CreateHandleMod( ARParamLT *cparamLT, AR_PIXEL_FORMAT pixFormat/*, int threadNum*/ );
AR2HandleT *ar2CreateHandleSubMod( int pixFormat, int xsize, int ysize/*, int threadNum*/ );

int             ar2TrackingMod              ( AR2HandleT *ar2Handle, AR2SurfaceSetT *surfaceSet,
                                           ARUint8 *dataPtr, float  trans[3][4], float  *err );
int             ar2SetInitTrans          ( AR2SurfaceSetT *surfaceSet, float  trans[3][4]    );

#ifdef __cplusplus
}
#endif
#endif