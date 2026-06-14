cmake_minimum_required(VERSION 3.16)
project(fleet CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Boost REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

add_executable(fleet src/main.cpp src/order_gen.cpp)
target_link_libraries(fleet PRIVATE Boost::system Threads::Threads)
# -O3: fast compile, fast runtime. Static linking removed — too slow to link on small VMs.
target_compile_options(fleet PRIVATE -O3)
