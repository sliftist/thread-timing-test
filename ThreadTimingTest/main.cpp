#include <windows.h>
#include <unordered_map>
#include <cstdio>
#include <chrono>
#include <functional>
#include <intrin.h>
#include <atomic>
#include <fstream>
#include <io.h>
#include <fcntl.h>


HANDLE SpawnThread(
	std::function<void()>* fnc
) {
	return CreateThread(
		0,
		0,
		// DWORD(*main)(void*)
		[](void* param) -> DWORD {
			auto fnc = (std::function<void()>*)param;
			(*fnc)();
			return 0;
		},
		fnc,
		0,
		0
	);
}




bool rateHyperThreaded(bool hyperThread) {
	volatile double clockValue = 0;
	volatile int killClock = 0;

	std::function<void()> fnc = [&]() {
		while (!killClock) {
			++clockValue;
		}
	};

	HANDLE thread = SpawnThread(&fnc);


	/*
	SetPriorityClass(GetCurrentProcess(), REALTIME_PRIORITY_CLASS);
	SetThreadPriority(thread, THREAD_PRIORITY_TIME_CRITICAL);
	SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
	//*/
	/*
	if (hyperThread) {
		SetThreadAffinityMask(thread, 2);
		SetThreadAffinityMask(GetCurrentThread(), 3);
	}
	else {
		SetThreadAffinityMask(thread, 2);
		SetThreadAffinityMask(GetCurrentThread(), 4);
	}
	*/

	//SetThreadAffinityMask(thread, 2);
	//SetThreadAffinityMask(GetCurrentThread(), 3);


	std::chrono::high_resolution_clock::time_point t1 = std::chrono::high_resolution_clock::now();
	const long long count = 1024ll * 1024 * 4;
	double* values = new double[count];
	unsigned int nothing;
	double proof = 1.1;
	for (int i = 0; i < count; ++i) {
		values[i] = clockValue;
	}

	killClock = 1;
	WaitForSingleObject(thread, INFINITE);

	long start = 0;
	while (start < count && values[start] == 0) {
		start++;
	}

	long long zeroCount = 0;
	for (int i = start; i < count - 1; ++i) {
		if (values[i + 1] == values[i]) {
			zeroCount++;
		}
	}

	double countUsed = (double)(count - start) / count;
	double zeroFrac = ((double)zeroCount) / (count - start);
	bool hyperThreaded = countUsed > 0.5 && zeroFrac < 0.5;
	if (hyperThreaded) {
		printf("countUsed %f, zeroFrac %f\n", countUsed, zeroFrac);
	}
	return hyperThreaded;
}

int main() {
	

	//todonext;
	// Run, putting our processTimes code here, and then... using the count of 0 diffs to determine if we are hyper-threading,
	//	and then don't as affinity and see if we naturally get into hyperthreaded states.
	//todonext;
	// Okay, switching thread affinity... isn't working. Default seems to work, but changing it isn't...

	int count = 100;
	int hyperCount = 0;

	for (int i = 0; i < count; i++) {
		if (rateHyperThreaded(false)) {
			hyperCount++;
		}
	}
	printf("%f hyper threaded\n", ((double)hyperCount) / count);

	//printf("%f\n", rateNotHyperThreaded(false));
	//printf("%f\n", rateNotHyperThreaded(true));

	/*
	_setmode(_fileno(stdout), O_BINARY);

	size_t written = fwrite(values, sizeof(double), count, stdout);
	if (written != count) {
		throw "wtf";
	}
	*/

	

	return 0;
}