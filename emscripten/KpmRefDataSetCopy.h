#ifndef KPM_REF_DATA_SET_COPY_H
#define KPM_REF_DATA_SET_COPY_H

#include <KPM/kpm.h>
#include <cstdlib>
#include <cstring>

/**
 * Deep copy of a KpmRefDataSet, allocated the way kpmDeleteRefDataSet() frees
 * it (malloc for the set, its refPoint array, its pageInfo array and each
 * page's imageInfo array). Returns nullptr for a null source or on allocation
 * failure.
 *
 * kpmMergeRefDataSet() consumes its second argument, so a merge cannot be
 * undone. addNFTMarkers() merges a new batch into a copy of the accumulated
 * set instead, and keeps the copy only if kpmSetRefDataSet() accepts it; a
 * rejected batch then leaves the accumulated set and the matcher unchanged.
 */
inline KpmRefDataSet *kpmCopyRefDataSet(const KpmRefDataSet *src) {
  if (!src) return nullptr;

  KpmRefDataSet *dst = static_cast<KpmRefDataSet *>(std::calloc(1, sizeof(KpmRefDataSet)));
  if (!dst) return nullptr;

  if (src->num > 0) {
    dst->refPoint = static_cast<KpmRefData *>(std::malloc(sizeof(KpmRefData) * src->num));
    if (!dst->refPoint) {
      std::free(dst);
      return nullptr;
    }
    std::memcpy(dst->refPoint, src->refPoint, sizeof(KpmRefData) * src->num);
  }
  dst->num = src->num;

  if (src->pageNum > 0) {
    dst->pageInfo = static_cast<KpmPageInfo *>(std::calloc(src->pageNum, sizeof(KpmPageInfo)));
    if (!dst->pageInfo) {
      kpmDeleteRefDataSet(&dst);
      return nullptr;
    }
    // Set pageNum as pages are filled, so a failure part-way frees only what
    // was allocated.
    for (int i = 0; i < src->pageNum; i++) {
      const KpmPageInfo &page = src->pageInfo[i];
      dst->pageInfo[i].pageNo = page.pageNo;
      dst->pageInfo[i].imageNum = page.imageNum;
      if (page.imageNum > 0) {
        dst->pageInfo[i].imageInfo =
            static_cast<KpmImageInfo *>(std::malloc(sizeof(KpmImageInfo) * page.imageNum));
        if (!dst->pageInfo[i].imageInfo) {
          dst->pageNum = i;
          kpmDeleteRefDataSet(&dst);
          return nullptr;
        }
        std::memcpy(dst->pageInfo[i].imageInfo, page.imageInfo,
                    sizeof(KpmImageInfo) * page.imageNum);
      }
      dst->pageNum = i + 1;
    }
  }

  return dst;
}

#endif
