package com.vega.repos.config;

import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Lazy;

import java.net.URI;

@org.springframework.context.annotation.Configuration
public class HdfsConfig {

    @Value("${hdfs.uri}")
    private String hdfsUri;

    @Value("${hdfs.username:hdfs}")
    private String hdfsUsername;

    @Bean
    @Lazy
    public Configuration hadoopConfiguration() {
        Configuration conf = new Configuration();
        conf.set("fs.defaultFS", hdfsUri);
        conf.setBoolean("fs.hdfs.impl.disable.cache", true);
        return conf;
    }

    @Bean
    @Lazy
    public FileSystem hadoopFileSystem(Configuration conf) throws Exception {
        return FileSystem.get(URI.create(hdfsUri), conf, hdfsUsername);
    }
}
