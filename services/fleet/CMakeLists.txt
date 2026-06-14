cmake_minimum_required(VERSION 3.16)
project(fleet CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Boost REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

add_executable(fleet src/main.cpp src/order_gen.cpp)
target_link_libraries(fleet PRIVATE Boost::system Threads::Threads)

# -Os: optimize for size (fleet is not the latency bottleneck; engine is)
# -static: self-contained binary; no boost-libs needed in runtime image
target_compile_options(fleet PRIVATE -Os)
set_target_properties(fleet PROPERTIES LINK_FLAGS "-static -static-libgcc -static-libstdc++")
