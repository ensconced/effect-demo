#!/bin/bash

# Example API calls for the image processing service demo
# Make sure the server is running: npm start

BASE_URL="http://localhost:3000/api"

# Create a tiny test image (1x1 pixel PNG in base64)
# This is just for demo purposes - in production you'd upload real images
TEST_IMAGE="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

echo "========================================="
echo "Image Processing Service Examples"
echo "========================================="
echo ""

echo "1. Health Check"
curl -s http://localhost:3000/health | jq
echo -e "\n"

echo "2. Upload image (happy path - should succeed)"
echo "This goes through the full pipeline: validate → resize → optimize → storage → S3 → CDN → DB"
IMAGE_ID=$(curl -s -X POST $BASE_URL/images \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"test-image.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\",
    \"tags\": [\"test\", \"demo\"]
  }" | jq -r '.id')

echo "Created image ID: $IMAGE_ID"
echo -e "\n"

echo "3. Get image metadata"
curl -s $BASE_URL/images/$IMAGE_ID | jq
echo -e "\n"

echo "4. List all images"
curl -s $BASE_URL/images | jq
echo -e "\n"

echo "========================================="
echo "ERROR INJECTION DEMONSTRATIONS"
echo "========================================="
echo ""

echo "5. Trigger validation error"
echo "Notice the error handling in the response"
curl -s -X POST "$BASE_URL/images?fail=validation" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"test.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\"
  }" | jq
echo -e "\n"

echo "6. Partial resize failure (2/4 sizes fail)"
echo "Watch the logs - you'll see Promise.allSettled complexity"
curl -s -X POST "$BASE_URL/images?fail=resize-partial" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"partial-fail.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\"
  }" | jq
echo -e "\n"

echo "7. S3 upload failure (demonstrates rollback)"
echo "Watch the logs - file storage succeeds but S3 fails, triggering rollback"
curl -s -X POST "$BASE_URL/images?fail=s3" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"s3-fail.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\"
  }" | jq
echo -e "\n"

echo "8. CDN publish failure (partial success scenario)"
echo "Watch the logs - storage and S3 succeed, but CDN fails"
echo "This shows the rollback complexity when 3/4 steps succeed"
curl -s -X POST "$BASE_URL/images?fail=cdn" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"cdn-fail.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\"
  }" | jq
echo -e "\n"

echo "9. Multiple failures (storage + CDN)"
curl -s -X POST "$BASE_URL/images?fail=storage,cdn" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"multi-fail.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\"
  }" | jq
echo -e "\n"

echo "10. Random failure rate (30% chance)"
echo "Run this multiple times to see intermittent failures with retry logic"
curl -s -X POST "$BASE_URL/images?failureRate=0.3" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"$TEST_IMAGE\",
    \"originalName\": \"random-fail.png\",
    \"mimeType\": \"image/png\",
    \"userId\": \"user123\"
  }" | jq
echo -e "\n"

echo "11. Delete image"
if [ -n "$IMAGE_ID" ] && [ "$IMAGE_ID" != "null" ]; then
  curl -s -X DELETE $BASE_URL/images/$IMAGE_ID -v
  echo -e "\n"

  echo "12. Verify deletion (should return 500 with error)"
  curl -s $BASE_URL/images/$IMAGE_ID | jq
fi
echo -e "\n"

echo "========================================="
echo "RESOURCE LEAK DEMONSTRATION"
echo "========================================="
echo ""
echo "13. Upload with CDN failure 5 times to create orphaned temp files"
for i in {1..5}; do
  echo "Upload attempt $i..."
  curl -s -X POST "$BASE_URL/images?fail=cdn" \
    -H "Content-Type: application/json" \
    -d "{
      \"file\": \"$TEST_IMAGE\",
      \"originalName\": \"leak-test-$i.png\",
      \"mimeType\": \"image/png\",
      \"userId\": \"user123\"
    }" > /dev/null
done

echo ""
echo "Check for orphaned temp files:"
echo "ls -la data/temp"
echo "(You should see leftover files from failed uploads)"
echo ""

echo "========================================="
echo "Demo Complete!"
echo "========================================="
echo ""
echo "Key Observations:"
echo "1. Complex error handling with nested try-catch"
echo "2. Manual rollback logic that can itself fail"
echo "3. Retry logic duplicated across storage classes"
echo "4. Partial failures in parallel operations (resize)"
echo "5. Resource leaks when cleanup fails"
echo "6. No composability - can't easily add timeout, circuit breaker, etc."
echo ""
echo "This is what Effect TS solves!"
