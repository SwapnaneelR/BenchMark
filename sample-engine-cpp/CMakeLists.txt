cmake_minimum_required(VERSION 3.16)
project(engine CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Boost REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

add_executable(engine src/main.cpp)
target_link_libraries(engine PRIVATE Boost::system Threads::Threads)
target_compile_options(engine PRIVATE -O3 -march=native)
