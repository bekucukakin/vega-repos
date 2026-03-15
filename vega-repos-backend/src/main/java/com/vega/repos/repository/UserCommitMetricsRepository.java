package com.vega.repos.repository;

import com.vega.repos.entity.UserCommitMetrics;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserCommitMetricsRepository extends JpaRepository<UserCommitMetrics, Long> {

    Optional<UserCommitMetrics> findByUsernameIgnoreCase(String username);
}
