/*
 *	trackingSub.h
 *  ARToolKit5
 *
 *  Disclaimer: IMPORTANT:  This Daqri software is supplied to you by Daqri
 *  LLC ("Daqri") in consideration of your agreement to the following
 *  terms, and your use, installation, modification or redistribution of
 *  this Daqri software constitutes acceptance of these terms.  If you do
 *  not agree with these terms, please do not use, install, modify or
 *  redistribute this Daqri software.
 *
 *  In consideration of your agreement to abide by the following terms, and
 *  subject to these terms, Daqri grants you a personal, non-exclusive
 *  license, under Daqri's copyrights in this original Daqri software (the
 *  "Daqri Software"), to use, reproduce, modify and redistribute the Daqri
 *  Software, with or without modifications, in source and/or binary forms;
 *  provided that if you redistribute the Daqri Software in its entirety and
 *  without modifications, you must retain this notice and the following
 *  text and disclaimers in all such redistributions of the Daqri Software.
 *  Neither the name, trademarks, service marks or logos of Daqri LLC may
 *  be used to endorse or promote products derived from the Daqri Software
 *  without specific prior written permission from Daqri.  Except as
 *  expressly stated in this notice, no other rights or licenses, express or
 *  implied, are granted by Daqri herein, including but not limited to any
 *  patent rights that may be infringed by your derivative works or by other
 *  works in which the Daqri Software may be incorporated.
 *
 *  The Daqri Software is provided by Daqri on an "AS IS" basis.  DAQRI
 *  MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION
 *  THE IMPLIED WARRANTIES OF NON-INFRINGEMENT, MERCHANTABILITY AND FITNESS
 *  FOR A PARTICULAR PURPOSE, REGARDING THE DAQRI SOFTWARE OR ITS USE AND
 *  OPERATION ALONE OR IN COMBINATION WITH YOUR PRODUCTS.
 *
 *  IN NO EVENT SHALL DAQRI BE LIABLE FOR ANY SPECIAL, INDIRECT, INCIDENTAL
 *  OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 *  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) ARISING IN ANY WAY OUT OF THE USE, REPRODUCTION,
 *  MODIFICATION AND/OR DISTRIBUTION OF THE DAQRI SOFTWARE, HOWEVER CAUSED
 *  AND WHETHER UNDER THEORY OF CONTRACT, TORT (INCLUDING NEGLIGENCE),
 *  STRICT LIABILITY OR OTHERWISE, EVEN IF DAQRI HAS BEEN ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 *
 *  Copyright 2015 Daqri LLC. All Rights Reserved.
 *  Copyright 2010-2015 ARToolworks, Inc. All Rights Reserved.
 *
 *  Author(s): Hirokazu Kato, Philip Lamb.
 *
 */

#ifndef TRACKING_SUB_H
#define TRACKING_SUB_H

#include <ARUtil/thread_sub.h> 
#include <KPM/kpm.h>

#ifdef __cplusplus
extern "C" {
#endif

THREAD_HANDLE_T *trackingInitInit( KpmHandle *kpmHandle );
int trackingInitStart( THREAD_HANDLE_T *threadHandle, ARUint8 *imagePtrLuma );
/* Most pages one search can report. Must equal PAGES_MAX in ARToolKitNFT_js_td.h. */
#define TRACKING_INIT_MAX_RESULTS 20

typedef struct {
    int   page;          /* page number of the matched marker */
    float trans[3][4];   /* its initial pose */
    float error;         /* KPM pose error */
    int   inlierNum;     /* KPM inlier count: more means a better match */
} TrackingInitResult;

/*
 * Collect the result of the search started by trackingInitStart(): every page
 * KPM matched, up to maxResults.
 * Returns 0 while the search is still running, 1 once it has finished (with
 * *resultNum set, possibly to 0), or -1 on error.
 */
int trackingInitGetResults( THREAD_HANDLE_T *threadHandle, TrackingInitResult results[], int maxResults, int *resultNum );

/*
 * Single-page form, kept for the legacy threaded binding (ARToolKitJS_td.cpp).
 * Built on trackingInitGetResults(): reports only the best matched page, the
 * one with the most KPM inliers (ties: the lowest KPM error), as the
 * single-result KPM chose it.
 * Returns 0 while the search is still running, 1 with trans and *page set, or
 * -1 if the search matched no page or on error.
 */
int trackingInitGetResult( THREAD_HANDLE_T *threadHandle, float trans[3][4], int *page );
int trackingInitQuit( THREAD_HANDLE_T **threadHandle_p );

#ifdef __cplusplus
}
#endif

#endif // !TRACKING_SUB_H
