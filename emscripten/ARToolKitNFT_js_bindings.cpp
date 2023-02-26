#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(constant_bindings)
{
    register_vector<std::string>("StringList");
    register_vector<int>("IntList");
    register_vector<nftMarker>("nftMarkers");

    class_<ARToolKitNFT>("ARToolKitNFT")
    .constructor()
    .function("setup", &ARToolKitNFT::setup)
    .function("loadCamera", &ARToolKitNFT::loadCamera);
};