#!/bin/bash

# Example API calls for the document service demo
# Make sure the server is running: npm run dev

BASE_URL="http://localhost:3000/api"

echo "=== Document Management Service Examples ==="
echo ""

echo "1. Health Check"
curl -s http://localhost:3000/health | jq
echo -e "\n"

echo "2. Create a document"
DOC_ID=$(curl -s -X POST $BASE_URL/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Introduction to Effect TS",
    "content": "Effect TS is a powerful library for building robust TypeScript applications...",
    "author": "Jane Developer",
    "tags": ["effect", "typescript", "functional-programming"]
  }' | jq -r '.id')

echo "Created document ID: $DOC_ID"
echo -e "\n"

echo "3. Create another document"
curl -s -X POST $BASE_URL/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Advanced Error Handling",
    "content": "Error handling in TypeScript can be challenging...",
    "author": "Jane Developer",
    "tags": ["typescript", "errors"]
  }' | jq
echo -e "\n"

echo "4. Get the first document"
curl -s $BASE_URL/documents/$DOC_ID | jq
echo -e "\n"

echo "5. Update the document"
curl -s -X PUT $BASE_URL/documents/$DOC_ID \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Introduction to Effect TS (Updated)",
    "tags": ["effect", "typescript", "functional-programming", "updated"]
  }' | jq
echo -e "\n"

echo "6. List all documents"
curl -s $BASE_URL/documents | jq
echo -e "\n"

echo "7. Search by tag"
curl -s "$BASE_URL/documents?tag=typescript" | jq
echo -e "\n"

echo "8. Test validation error (empty title)"
curl -s -X POST $BASE_URL/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "",
    "content": "Some content",
    "author": "Test Author"
  }' | jq
echo -e "\n"

echo "9. Test not found error"
curl -s $BASE_URL/documents/nonexistent-id | jq
echo -e "\n"

echo "10. Delete the document"
curl -s -X DELETE $BASE_URL/documents/$DOC_ID -v
echo -e "\n"

echo "11. Verify deletion (should return 404)"
curl -s $BASE_URL/documents/$DOC_ID | jq
echo -e "\n"

echo "=== Demo Complete ==="
