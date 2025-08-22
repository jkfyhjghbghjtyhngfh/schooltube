import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { WebsimSocket, useQuery } from '@websim/use-query';

const room = new WebsimSocket();

// IMPORTANT: Websim handles user authentication automatically.
// Users are automatically assigned a unique user_id and username
// which can be accessed via `window.websim.getCurrentUser()`.
// Therefore, a custom sign-up/login system with username and password
// is not necessary and not supported within the Websim application context.
// Your application already uses the built-in user system for video creators.

// Helper component to display and play SFX assets
function SfxPlayer({ videoConceptId }) {
  const { data: sfxAssets, loading: sfxLoading, error: sfxError } = useQuery(
    room.collection('sfx_assets').filter({ video_concept_id: videoConceptId })
  );

  const playAudio = useCallback((url) => {
    const audio = new Audio(url);
    audio.play().catch(e => console.error("Error playing audio:", e));
  }, []);

  if (sfxLoading) return <p className="text-xs text-gray-500 mt-2">Loading SFX...</p>;
  if (sfxError) return <p className="text-xs text-red-500 mt-2">Error loading SFX.</p>;
  if (!sfxAssets || sfxAssets.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-gray-700 mb-1">Sound Effects:</p>
      <div className="flex flex-wrap gap-2">
        {sfxAssets.map((sfx) => (
          <button
            key={sfx.id}
            onClick={() => playAudio(sfx.sfx_url)}
            className="flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs hover:bg-purple-200 transition duration-200"
            title={`Play ${sfx.sfx_name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-1">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM10.5 8.25a.75.75 0 0 0-1.5 0v7.5a.75.75 0 0 0 1.5 0V8.25ZM14.25 8.25a.75.75 0 0 0-1.5 0v7.5a.75.75 0 0 0 1.5 0V8.25Z" clipRule="evenodd" />
            </svg>
            {sfx.sfx_name}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [sfxFiles, setSfxFiles] = useState([]); // New state for SFX files
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState({ name: 'home' });

  // Fetch all published videos, ordered by created_at descending using SQL
  // Corrected: Join with public.user table to get the username and include v.user_id
  const { data: videos, loading, error: queryError } = useQuery(
    room.query('SELECT v.id, v.title, v.description, v.thumbnail_url, v.video_url, v.user_id, u.username, v.created_at FROM public.videos v JOIN public.user u ON v.user_id = u.id ORDER BY v.created_at DESC')
  );

  // Query for user-specific videos
  const { data: userVideos, loading: userVideosLoading, error: userVideosError } = useQuery(
    currentPage.name === 'userVideos'
      ? room.query('SELECT v.id, v.title, v.description, v.thumbnail_url, v.video_url, v.user_id, u.username, v.created_at FROM public.videos v JOIN public.user u ON v.user_id = u.id WHERE v.user_id = $1 ORDER BY v.created_at DESC', [currentPage.userId])
      : null
  );

  const handleThumbnailFileChange = useCallback((e) => {
    setThumbnailFile(e.target.files[0]);
  }, []);

  const handleVideoFileChange = useCallback((e) => {
    setVideoFile(e.target.files[0]);
  }, []);

  const handleSfxFileChange = useCallback((e) => {
    setSfxFiles(Array.from(e.target.files));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('');

    if (!title.trim() || !description.trim() || !thumbnailFile || !videoFile) {
      setError('Please fill in all fields and select a thumbnail and a main video file.');
      setIsUploading(false);
      return;
    }

    try {
      let thumbnailUrl = null;
      if (thumbnailFile) {
        setUploadStatus('Uploading thumbnail...');
        setUploadProgress(20);
        thumbnailUrl = await window.websim.upload(thumbnailFile);
      }

      let videoUrl = null;
      if (videoFile) {
        setUploadStatus('Uploading main video content...');
        setUploadProgress(40);
        videoUrl = await window.websim.upload(videoFile);
      }

      setUploadStatus('Saving video concept details...');
      setUploadProgress(60);
      const newVideo = await room.collection('videos').create({
        title,
        description,
        thumbnail_url: thumbnailUrl,
        video_url: videoUrl,
      });

      if (sfxFiles.length > 0) {
        setUploadStatus(`Uploading ${sfxFiles.length} sound effects...`);
        let uploadedSfxCount = 0;
        for (const sfxFile of sfxFiles) {
          const sfxUrl = await window.websim.upload(sfxFile);
          await room.collection('sfx_assets').create({
            video_concept_id: newVideo.id, // Link to the newly created video concept
            sfx_url: sfxUrl,
            sfx_name: sfxFile.name,
          });
          uploadedSfxCount++;
          setUploadProgress(60 + (uploadedSfxCount / sfxFiles.length) * 30); // Increment progress for SFX
          setUploadStatus(`Uploaded ${uploadedSfxCount}/${sfxFiles.length} sound effects.`);
        }
      }

      setUploadStatus('Video concept published successfully!');
      setUploadProgress(100);

      setTitle('');
      setDescription('');
      setThumbnailFile(null);
      setVideoFile(null);
      setSfxFiles([]); // Clear SFX files
      document.getElementById('thumbnailInput').value = '';
      document.getElementById('videoInput').value = '';
      document.getElementById('sfxInput').value = ''; // Clear SFX input
      
      // Give a short delay to show 100% progress and success message
      setTimeout(() => {
        setCurrentPage({ name: 'home' });
        setUploadProgress(0);
        setUploadStatus('');
      }, 1500);
      
    } catch (err) {
      console.error('Failed to publish video concept:', err);
      setError('Failed to publish video concept. Please try again.');
      setUploadProgress(0);
      setUploadStatus('Upload failed.');
    } finally {
      if (error) { // Only reset uploading state if there was an error, else it's handled by setTimeout
        setIsUploading(false);
      }
    }
  }, [title, description, thumbnailFile, videoFile, sfxFiles, error]);

  const handleVideoEnded = useCallback(async (videoId, currentViewCount) => {
    // Increment view count when the video finishes playing
    try {
      await room.collection('videos').upsert({
        id: videoId,
        view_count: currentViewCount + 1,
      });
      console.log(`Incremented view count for video ${videoId} to ${currentViewCount + 1}`);
    } catch (err) {
      console.error('Failed to increment view count:', err);
    }
  }, []);

  return (
    <div className="flex">
      {/* Sidebar Navigation */}
      <aside className="w-16 bg-gray-800 text-white flex flex-col items-center py-4 fixed h-full shadow-lg z-10">
        <button
          onClick={() => setCurrentPage({ name: 'home' })}
          className={`p-3 rounded-lg mb-4 transition duration-300 ${currentPage.name === 'home' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          title="Home - View Video Concepts"
        >
          {/* Home Icon SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12m-4.5 9a.75.75 0 0 0 .75-.75V5.69l-4.5 4.5a1.5 1.5 0 0 1-2.122 0L6.75 5.69v14.56c0 .414.336.75.75.75h9Z" />
          </svg>
        </button>
        <button
          onClick={() => setCurrentPage({ name: 'create' })}
          className={`p-3 rounded-lg transition duration-300 ${currentPage.name === 'create' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          title="Create New Video Concept"
        >
          {/* Plus Icon SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-16 min-h-screen">
        <div className="container mx-auto p-4 max-w-2xl">
          {currentPage.name !== 'userVideos' && (
            <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Video Home</h1>
          )}
          {currentPage.name === 'home' && (
            <p className="text-md text-center text-gray-600 mb-8">Discover and create amazing video concepts!</p>
          )}

          {currentPage.name === 'create' && (
            // Video Creation Form
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-700">Create a New Video Concept</h2>
              {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

              {isUploading && uploadProgress > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 mb-1 font-semibold">{uploadStatus}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="title" className="block text-gray-700 text-sm font-bold mb-2">Video Concept Title</label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  placeholder="Enter video concept title"
                  disabled={isUploading}
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="description" className="block text-gray-700 text-sm font-bold mb-2">Video Concept Description</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows="4"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  placeholder="Describe your video concept and intended edit"
                  disabled={isUploading}
                  required
                ></textarea>
              </div>

              <div className="mb-6">
                <label htmlFor="thumbnailInput" className="block text-gray-700 text-sm font-bold mb-2">Video Thumbnail</label>
                <input
                  type="file"
                  id="thumbnailInput"
                  accept="image/*"
                  onChange={handleThumbnailFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
                  disabled={isUploading}
                  required
                />
                {thumbnailFile && <p className="mt-2 text-sm text-gray-600">Selected: {thumbnailFile.name}</p>}
              </div>
              
              <div className="mb-6">
                <label htmlFor="videoInput" className="block text-gray-700 text-sm font-bold mb-2">Main Video File</label>
                <input
                  type="file"
                  id="videoInput"
                  accept="video/*"
                  onChange={handleVideoFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  disabled={isUploading}
                  required
                />
                {videoFile && <p className="mt-2 text-sm text-gray-600">Selected: {videoFile.name}</p>}
              </div>

              {/* New SFX file input */}
              <div className="mb-6">
                <label htmlFor="sfxInput" className="block text-gray-700 text-sm font-bold mb-2">Sound Effects (SFX) Files</label>
                <input
                  type="file"
                  id="sfxInput"
                  accept="audio/*"
                  multiple // Allows multiple SFX files to be selected
                  onChange={handleSfxFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                  disabled={isUploading}
                />
                {sfxFiles.length > 0 && (
                  <p className="mt-2 text-sm text-gray-600">Selected: {sfxFiles.map(f => f.name).join(', ')}</p>
                )}
              </div>

              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full disabled:opacity-50"
                disabled={isUploading}
              >
                {isUploading ? 'Publishing Concept...' : 'Publish Video Concept'}
              </button>
            </form>
          )}

          {currentPage.name === 'home' && (
            <>
              {/* This h2 is now redundant with the h1 and tagline, so it's hidden */}
              <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center hidden">Published Video Concepts</h2> 
              {queryError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">Error loading videos: {queryError.message}</div>}
              
              {loading ? (
                <div className="text-center text-gray-600">Loading video concepts...</div>
              ) : videos && videos.length === 0 ? (
                <div className="text-center text-gray-600">No video concepts published yet. Be the first!</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {videos.map((video) => (
                    <div key={video.id} className="bg-white rounded-lg shadow-md overflow-hidden transform transition duration-300 hover:scale-105">
                      {video.video_url ? (
                        <video 
                          controls 
                          className="w-full h-48 object-cover" 
                          poster={video.thumbnail_url}
                        >
                          <source src={video.video_url} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      ) : video.thumbnail_url && (
                        <img src={video.thumbnail_url} alt={`Thumbnail for ${video.title}`} className="w-full h-48 object-cover" />
                      )}
                      <div className="p-4">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">{video.title}</h3>
                        <p className="text-gray-600 text-sm mb-3 line-clamp-3">{video.description}</p>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center">
                            <img
                              src={`https://images.websim.com/avatar/${video.username}`}
                              alt={`${video.username}'s avatar`}
                              className="w-6 h-6 rounded-full mr-2 cursor-pointer"
                              onClick={() => setCurrentPage({ name: 'userVideos', userId: video.user_id, username: video.username })}
                            />
                            <span>By <span className="font-semibold text-gray-700">{video.username}</span></span>
                          </div>
                          
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Published: {new Date(video.created_at).toLocaleDateString()}</p>
                        <SfxPlayer videoConceptId={video.id} /> {/* Display SFX for this video concept */}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {currentPage.name === 'userVideos' && (
            <>
              <button
                onClick={() => setCurrentPage({ name: 'home' })}
                className="mb-6 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition duration-300 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Home
              </button>
              <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">Video Concepts by {currentPage.username}</h2>
              {userVideosError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">Error loading videos: {userVideosError.message}</div>}
              
              {userVideosLoading ? (
                <div className="text-center text-gray-600">Loading video concepts...</div>
              ) : userVideos && userVideos.length === 0 ? (
                <div className="text-center text-gray-600">No video concepts published by this user yet.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {userVideos.map((video) => (
                    <div key={video.id} className="bg-white rounded-lg shadow-md overflow-hidden transform transition duration-300 hover:scale-105">
                      {video.video_url ? (
                        <video 
                          controls 
                          className="w-full h-48 object-cover" 
                          poster={video.thumbnail_url}
                        >
                          <source src={video.video_url} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      ) : video.thumbnail_url && (
                        <img src={video.thumbnail_url} alt={`Thumbnail for ${video.title}`} className="w-full h-48 object-cover" />
                      )}
                      <div className="p-4">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">{video.title}</h3>
                        <p className="text-gray-600 text-sm mb-3 line-clamp-3">{video.description}</p>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center">
                            <img
                              src={`https://images.websim.com/avatar/${video.username}`}
                              alt={`${video.username}'s avatar`}
                              className="w-6 h-6 rounded-full mr-2"
                            />
                            <span>By <span className="font-semibold text-gray-700">{video.username}</span></span>
                          </div>
                          
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Published: {new Date(video.created_at).toLocaleDateString()}</p>
                        <SfxPlayer videoConceptId={video.id} /> {/* Display SFX for this video concept */}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
