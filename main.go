package main

import (
	"flag"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables from .env file (optional)
	_ = godotenv.Load()

	// Get default values from environment variables
	defaultProject := os.Getenv("BIGQUERY_PROJECT_ID")
	defaultEmulator := os.Getenv("BIGQUERY_EMULATOR_HOST")
	if defaultEmulator == "" {
		defaultEmulator = "localhost:9050"
	}

	// Parse command-line flags
	project := flag.String("project", defaultProject, "BigQuery project id")
	emulator := flag.String("emulator", defaultEmulator, "BigQuery emulator host")
	flag.Parse()

	// Set the environment variables if provided through flags
	if *project != "" {
		os.Setenv("BIGQUERY_PROJECT_ID", *project)
	}
	if *emulator != "" {
		os.Setenv("BIGQUERY_EMULATOR_HOST", *emulator)
	}

	// Initialize BigQuery client
	bqClient, err := NewBigQueryClient()
	if err != nil {
		log.Fatalf("Failed to create BigQuery client: %v", err)
	}
	defer bqClient.Close()

	// Initialize Gin router and configure CORS
	router := gin.Default()
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		AllowCredentials: true,
	}))

	// Serve the index.html on the root path
	router.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})

	// API routes
	api := router.Group("/api")
	{
		api.GET("/projects", bqClient.GetProjects)
		api.GET("/projects/:project_id/datasets", bqClient.GetDatasets)
		api.GET("/projects/:project_id/datasets/:dataset_id/tables", bqClient.GetTables)
		api.GET("/projects/:project_id/datasets/:dataset_id/tables/:table_id/schema", bqClient.GetTableSchema)
		api.POST("/query", bqClient.RunQuery)
	}

	router.Static("/static", "./static")

	// Determine server port
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("Server starting on port %s\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
