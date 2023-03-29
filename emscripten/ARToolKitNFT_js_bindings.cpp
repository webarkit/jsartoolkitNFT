#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(constant_bindings)
{
    register_vector<std::string>("StringList");
    register_vector<int>("IntList");
    register_vector<nftMarker>("nftMarkers");

    class_<ARToolKitNFT>("ARToolKitNFT")
    .constructor()
    .function("detectMarker", &ARToolKitNFT::detectMarker)
    .function("detectNFTMarker", &ARToolKitNFT::detectNFTMarker)
    .function("getNFTMarker", &ARToolKitNFT::getNFTMarkerInfo)
    .function("setLogLevel", &ARToolKitNFT::setLogLevel)
	.function("getLogLevel", &ARToolKitNFT::getLogLevel)
    .function("setupAR2", &ARToolKitNFT::setupAR2)
    .function("teardown", &ARToolKitNFT::teardown)
    .function("loadCamera", &ARToolKitNFT::loadCamera)
    .function("setup", &ARToolKitNFT::setup)
    .function("getCameraLens", &ARToolKitNFT::getCameraLens)
    .function("_addNFTMarkers", &ARToolKitNFT::addNFTMarkers);

    /* nft marker struct */
	value_object<nftMarker>("nftMarker")
	.field("id", &nftMarker::id_NFT)
	.field("width", &nftMarker::width_NFT)
	.field("height", &nftMarker::height_NFT)
	.field("dpi", &nftMarker::dpi_NFT);
    
};