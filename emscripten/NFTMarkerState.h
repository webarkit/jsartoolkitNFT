#ifndef NFT_MARKER_STATE_H
#define NFT_MARKER_STATE_H

#include <AR/ar.h>
#include <AR/arFilterTransMat.h>

/**
 * Tracking state for one NFT marker (page).
 *
 * The bindings keep one of these per loadable page (PAGES_MAX). It replaces the
 * single `detectedPage` / `ftmi` pair that limited tracking to one marker at a
 * time (#613, #611).
 */
struct NFTMarkerState {
  bool tracking = false;                // AR2 is locked on this page
  ARdouble pose[3][4] = {};             // latest pose, filtered when filtering is on
  float err = -1.0f;                    // AR2 tracking error for `pose`
  ARFilterTransMatInfo *ftmi = nullptr; // this marker's pose filter, created on first use
  bool filterNeedsReset = true;         // restart the filter on (re)acquisition
};

#endif // NFT_MARKER_STATE_H
