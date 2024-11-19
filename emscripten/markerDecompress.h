#include <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct
{
    char *iset_content;   
    char *fset_content;    
    char *fset3_content; 
} markerContentStruct;

char* nameConcat(const char *s1, const char *s2);
FILE *openZFT( const char *filename, const char *ext);
int decompressMarkers(const char* src, const char* outTemp);
void extractDataAndSave(const char* str, const char* name);

#ifdef __cplusplus
}
#endif
