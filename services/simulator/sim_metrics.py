from prometheus_client import Counter

simulated_readings_total = Counter("simulated_readings_total", "Readings successfully accepted by API")
simulator_post_errors_total = Counter("simulator_post_errors_total", "Failed POST /readings attempts (after retries)")
simulator_post_retries_total = Counter("simulator_post_retries_total", "Retry attempts on POST /readings")
