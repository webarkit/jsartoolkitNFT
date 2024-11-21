#include "markerDecompress.h"
#include <emscripten.h>

#ifdef _WIN32
#  include <Windows.h>
#else
#  include <sys/stat.h>
#endif

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <AR/ar.h>
#include <zlib/zlib.h>

const int mem_size_4mb = 4*1024*1024;

int decompressMarkers(const char* src, const char* outTemp){
    // markerContentStruct *markerData;
    FILE *fp;
    char* in;
    char* out;
    int filesize, ret;
    const char *ext = "zft";
    char *c = malloc (mem_size_4mb);

    fp = openZFT(src, ext);
    if ( fp == NULL )
    {
        ARLOGe("Error opening .zft file\n");
        exit(EXIT_FAILURE);
    }

    fseek (fp, 0, SEEK_END);
    filesize = ftell (fp);
    fseek (fp, 0, SEEK_SET);

    in = malloc (filesize);

    if (in == NULL)
    {
        ARLOGe("Error mallocing %i bytes for inflate\n", filesize);
        exit(EXIT_FAILURE);
    }
    ret = fread (in, 1, filesize, fp);
    fclose (fp);
    char *tempName = nameConcat(src, ext);
    remove(tempName);
    free(tempName);

    z_stream infstream;
    infstream.zalloc = Z_NULL;
    infstream.zfree = Z_NULL;
    infstream.opaque = Z_NULL;
    infstream.avail_in = filesize;
    infstream.next_in = (Bytef *) in;
    infstream.avail_out = (uInt)mem_size_4mb;
    infstream.next_out = (Bytef *) c;

    inflateInit(&infstream);
    inflate(&infstream, Z_NO_FLUSH);
    inflateEnd(&infstream);

    free(in);

    extractDataAndSave(c, outTemp);

    free(c);
    return 0;
    // return markerData;
}

void extractDataAndSave(const char* str, const char* name){
    // string and variable name structure
    //
    //                iset_final_index
    //               V
    // str = {"iset":"test","fset":"test2","fset3":"test3"}
    //       ∧
    //        Beginning of str or iset_initial_index
    //
    //
    // iset_final_index    fset_initial_index
    //                V    V
    //  str = {"iset":"test","fset":"test2","fset3":"test3"}
    //                 ---- <- iset_content
    //

    // markerContentStruct *tempMarkerData;

    FILE *tempIset;
    FILE *tempFset;
    FILE *tempFset3;

    int iset_final_index = 9;

    char *fsetInitialIndex = strstr(str, "\",\"fset\":\"");
    if (fsetInitialIndex == NULL) {
        ARLOGe("Error: 'fset' not found in the string.\n");
        exit(EXIT_FAILURE);
    }
    int fset_initial_index = (fsetInitialIndex - str);

    int fset_final_index = (fset_initial_index + 10);

    int iset_content_size = fset_initial_index - iset_final_index;

    char *fset3InitialIndex = strstr(str, "\",\"fset3\":\"");
    if (fset3InitialIndex == NULL) {
        ARLOGe("Error: 'fset3' not found in the string.\n");
        exit(EXIT_FAILURE);
    }
    int fset3_initial_index = (fset3InitialIndex - str);
    int fset3_final_index = (fset3_initial_index + 11);

    int fset_content_size = fset3_initial_index - fset_final_index;

    char *endOfStr = strstr(str, "\"}");
    if (endOfStr == NULL) {
        ARLOGe("Error: end of string not found.\n");
        exit(EXIT_FAILURE);
    }
    int endPos = endOfStr - str;

    int fset3_content_size = endPos - fset3_final_index;

    // ---ISET---
    if (iset_content_size <= 0) {
        ARLOGe("Error: Invalid iset_content_size: %d\n", iset_content_size);
        exit(EXIT_FAILURE);
    }
    char *iset_contentHex = malloc(iset_content_size);
    strncpy(iset_contentHex, str + iset_final_index, iset_content_size);

    // tempMarkerData->iset_content = iset_contentHex;
    char *isetName = nameConcat(name, ".iset");
    tempIset = fopen(isetName, "w");
    fwrite(iset_contentHex, iset_content_size, 1, tempIset);
    // printf(iset_contentHex);
    fclose(tempIset);
    free(isetName);
    free(iset_contentHex);

    // ---FSET---
    char *fset_contentHex = malloc(fset_content_size);
    strncpy(fset_contentHex, str + fset_final_index, fset_content_size);

    // tempMarkerData->fset_content = fset_contentHex;
    char *fsetName = nameConcat(name, ".fset");
    tempFset = fopen(fsetName, "w");
    fwrite(fset_contentHex, fset_content_size, 1, tempFset);
    fclose(tempFset);
    free(fsetName);
    free(fset_contentHex);

    // ---FSET3---
    char *fset3_contentHex = malloc(fset3_content_size);
    strncpy(fset3_contentHex, str + fset3_final_index, fset3_content_size);

    // tempMarkerData->fset3_content = fset3_contentHex;
    char *fset3Name = nameConcat(name, ".fset3");
    tempFset3 = fopen(fset3Name, "w");
    fwrite(fset3_contentHex, fset3_content_size, 1, tempFset3);
    fclose(tempFset3);
    free(fset3Name);
    free(fset3_contentHex);

    // return tempMarkerData;
}

FILE *openZFT( const char *filename, const char *ext)
{
    FILE   *fp;
    char   *buf;
    size_t  len;

    if (!filename) return (NULL);
    if (ext) {
        len = strlen(filename) + strlen(ext) + 2; // space for '.' and '\0'.
        arMalloc(buf, char, len);
        sprintf(buf, "%s.%s", filename, ext);
        fp = fopen(buf,"rb");
        free(buf);
    } else {
        fp = fopen(filename,"rb");
    }

    return fp;
}

char* nameConcat(const char *s1, const char *s2)
{
    const size_t len1 = strlen(s1);
    const size_t len2 = strlen(s2);
    char *result = malloc(len1 + len2 + 1); // +1 for the null-terminator
    // in real code you would check for errors in malloc here
    memcpy(result, s1, len1);
    memcpy(result + len1, s2, len2 + 1); // +1 to copy the null-terminator
    return result;
}