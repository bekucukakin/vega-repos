package com.vega.repos.repository;

import com.vega.repos.entity.UserPrMetrics;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserPrMetricsRepository extends JpaRepository<UserPrMetrics, Long> {

    Optional<UserPrMetrics> findByUsernameIgnoreCase(String username);
}
