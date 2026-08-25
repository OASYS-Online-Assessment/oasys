<?php

	/*
	 * Class webmInfo v1.01
	 */
	class webmInfo
	{

		private $handle;
		private ?rixPDO $db = null;
		private array $info = [];
		private ?array $track = null;
		private bool $debug = false;
		private string $mediaLocation;
		private int $position = 0;
		private int $fileId = -1;
		private int $filesize = 0;
		private array $ebmlIds;
		private int $seekHeadPosition;
		private array $seekInfo = [];
		private bool $valid;


		/* constants */
		const AUDIO_VIDEO = 1;
		const AUDIO = 2;
		const VIDEO = 3;
		const UNKNOWN = 4;
		const INVALID = 99;
		const TRACK_TYPE_VIDEO = 1;
		const TRACK_TYPE_AUDIO = 2;


		/**
		 * @throws Exception
		 */
		public function __construct($mediaLocation, $path, $db = null)
		{
			if ($this->debug) echo "<pre>webmInfo constructor\n\n";

			$this->initializeIdTable();
			$this->mediaLocation = $mediaLocation;
			if ($this->mediaLocation === 'database') {
				if ($db instanceof rixPDO) {
					$this->db = $db;
				} else {
					throw new Exception('Missing instance to database');
				}
				if (is_numeric($path)) {
					$this->fileId = is_integer($path) ? $path : intval($path);
				} else {
					throw new Exception('Path must be the auto increment id of the file');
				}
				$results = $db->fetchValue("SELECT COUNT(*) FROM mediaFiles WHERE id=?", [$this->fileId]);
				if ($results['error'] || $results['rows'] < 1) {
					throw new Exception('Error reading from blob');
				}
				if ($results['data'] !== 1) {
					throw new Exception('Could not open blob');
				}
				$results = $db->fetchValue("SELECT LENGTHB(data) FROM mediaFiles WHERE id=?", [$this->fileId]);
				$this->filesize = $results['data'];
			} else {
				if (!file_exists($path)) {
					throw new Exception('File not found');
				}

				$this->handle = fopen($path, 'r');
				if ($this->handle === false) {
					throw new Exception('Could not open file');
				}
			}

			try {
				//read EBML id
				$fpos = $this->tell();
				if ($this->debug) echo "Reading EBML id\n";
				$id = $this->readId(); //read first id to check if it is an EBML file
				$this->verifyAssumption($id === $this->ebmlIds['EBML'], "EBML id not found");
				$len = $this->readSize();

				//read EBML version
				if ($this->debug) echo "Reading EBML version\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['EBMLVersion'], "EBMLVersion id not found");
				$data = $this->readInteger();
				$this->info['EBMLVersion'] = $data;

				//read EBML read version
				if ($this->debug) echo "Reading EBML read version\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['EBMLReadVersion'], "EBMLReadVersion id not found");
				$data = $this->readInteger();
				$this->info['EBMLReadVersion'] = $data;

				//read EBML max ID length
				if ($this->debug) echo "Reading EBML max ID length\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['EBMLMaxIDLength'], "EBMLMaxIDLength id not found");
				$data = $this->readInteger();
				$this->info['EBMLMaxIDLength'] = $data;

				//read EBML max size length
				if ($this->debug) echo "Reading EBML max size length\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['EBMLMaxSizeLength'], "EBMLMaxSizeLength id not found");
				$data = $this->readInteger();
				$this->info['EBMLMaxSizeLength'] = $data;

				//read DocType
				if ($this->debug) echo "Reading DocType\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['DocType'], "DocType id not found");
				$data = $this->readString();
				$this->info['DocType'] = $data;
				if ($data !== 'webm') {
					throw new Exception('Not a WebM file');
				}

				//read DocType version
				if ($this->debug) echo "Reading DocType version\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['DocTypeVersion'], "DocTypeVersion id not found");
				$data = $this->readInteger();
				$this->info['DocTypeVersion'] = $data;

				//read DocType read version
				if ($this->debug) echo "Reading DocType read version\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['DocTypeReadVersion'], "DocTypeReadVersion id not found");
				$data = $this->readInteger();
				$this->info['DocTypeReadVersion'] = $data;

				//read Segment
				if ($this->debug) echo "Reading Segment\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['Segment'], "Segment id not found");
				$len = $this->readSize();

				//read SeekHead
				if ($this->debug) echo "Reading SeekHead\n";
				$id = $this->readId();
				$this->verifyAssumption($id === $this->ebmlIds['SeekHead'], "SeekHead id not found");
				$this->seekHeadPosition = $this->position - 4;
				$seekHeadLength = $this->readSize();

				while ($this->position < $this->seekHeadPosition + $seekHeadLength) {
					//read Seek
					if ($this->debug) echo "Reading Seek\n";
					$id = $this->readId();
					$this->verifyAssumption($id === $this->ebmlIds['Seek'], "Seek id not found");
					$len = $this->readSize();

					//read SeekID
					if ($this->debug) echo "Reading SeekID\n";
					$id = $this->readId();
					$this->verifyAssumption($id === $this->ebmlIds['SeekID'], "SeekID id not found");
					$seekId = $this->readInteger();

					//read SeekPosition
					if ($this->debug) echo "Reading SeekPosition\n";
					$id = $this->readId();
					$this->verifyAssumption($id === $this->ebmlIds['SeekPosition'], "SeekPosition id not found");
					$seekPosition = $this->readInteger();

					$this->seekInfo[$seekId] = $seekPosition;
				}

				//read Info
				$this->readInfo();

				//read Tracks
				$this->readTracks();

				$this->valid = true;

			} catch (Exception $e) {
				if ($this->debug) echo "Error: " . $e->getMessage() . "\n";
				$this->valid = false;
				return;
			}

			if ($this->debug) {
				print_r($this->seekInfo);
				echo "</pre>";
			}

		}

		public function __destruct()
		{
			if ($this->mediaLocation === 'disk') {
				fclose($this->handle);
			}
		}

		public function isValid(): bool
		{
			return $this->valid;
		}

		public function getInfo(): array
		{
			return $this->info;
		}

		public function getType(): int
		{
			if (!$this->valid) {
				return self::INVALID;
			}
			$audio = false;
			$video = false;
			foreach ($this->info['tracks'] as $track) {
				if ($track['type'] === self::TRACK_TYPE_AUDIO) {
					$audio = true;
				}
				if ($track['type'] === self::TRACK_TYPE_VIDEO) {
					$video = true;
				}
			}
			if ($audio && $video) {
				return self::AUDIO_VIDEO;
			} elseif ($audio) {
				return self::AUDIO;
			} elseif ($video) {
				return self::VIDEO;
			} else {
				return self::UNKNOWN;
			}
		}

		/* ------------- private functions --------------- */

		/* reads info block */
		/**
		 * @throws Exception
		 */
		private function readInfo(): void
		{
			/* seek to the start of the info block */
			if (!isset($this->seekInfo[$this->ebmlIds['Info']])) {
				throw new Exception('Info block not found');
			}
			$infoPosition = $this->seekHeadPosition + $this->seekInfo[$this->ebmlIds['Info']];
			$this->seek($infoPosition);
			if ($this->debug) echo "Reading Info\n";
			$id = $this->readId();
			$this->verifyAssumption($id === $this->ebmlIds['Info'], "Info id not found");
			$infoLength = $this->readSize();
			$infoStart = $this->position;

			/* iterate through the info block skipping all entries but those we want */
			while ($this->position < $infoStart + $infoLength) {
				$id = $this->readId();
				$size = $this->readSize();
				switch ($id) {
					case $this->ebmlIds['TimestampScale']:
						$this->info['TimestampScale'] = $this->readInteger($size);
						break;
					case $this->ebmlIds['Duration']:
						$this->info['DurationInTicks'] = $this->readFloat($size);
						break;
					case $this->ebmlIds['DateUTC']:
						$this->info['DateUTC'] = $this->readInteger($size);
						break;
					case $this->ebmlIds['Title']:
						$this->info['Title'] = $this->readString($size);
						break;
					default:
						$this->skipBytes($size);
				}
			}

			/* if both TimestampScale and Duration are set, calculate the duration in seconds */
			if (isset($this->info['TimestampScale']) && isset($this->info['DurationInTicks'])) {
				$this->info['Duration'] = $this->info['DurationInTicks'] * ($this->info['TimestampScale'] / 1000000000);
			}
		}

		/* reads tracks block */
		/**
		 * @throws Exception
		 */
		private function readTracks(): void
		{
			/* seek to the start of the tracks block */
			if (!isset($this->seekInfo[$this->ebmlIds['Tracks']])) {
				throw new Exception('Tracks block not found');
			}
			$tracksPosition = $this->seekHeadPosition + $this->seekInfo[$this->ebmlIds['Tracks']];
			$this->seek($tracksPosition);
			if ($this->debug) echo "Reading Tracks\n";
			$id = $this->readId();
			$this->verifyAssumption($id === $this->ebmlIds['Tracks'], "Tracks id not found");
			$tracksLength = $this->readSize();

			/* iterate through the trackEntries */
			while ($this->position < $tracksPosition + $tracksLength) {
				$id = $this->readId();
				$size = $this->readSize();
				if ($id === $this->ebmlIds['TrackEntry']) {
					$this->readTrackEntry($size);
					$this->setTrack();
				} else {
					$this->skipBytes($size);
				}
			}
		}

		/* reads track entry */
		private function readTrackEntry($trackSize): void
		{
			$track = [];
			$trackStart = $this->position;
			while ($this->position < $trackStart + $trackSize) {
				$id = $this->readId();
				$size = $this->readSize();
				switch ($id) {
					case $this->ebmlIds['TrackNumber']:
						$track['id'] = $this->readInteger($size);
						break;
					case $this->ebmlIds['TrackUID']:
						$track['uid'] = $this->readInteger($size);
						break;
					case $this->ebmlIds['TrackType']:
						$track['type'] = $this->readInteger($size);
						break;
					case $this->ebmlIds['Video']:
						$video = $this->readVideo($size);
						$track['width'] = $video['width'];
						$track['height'] = $video['height'];
						break;
					default:
						$this->skipBytes($size);
				}
			}
			$this->track = $track;
		}

		/* reads video properties */
		private function readVideo($videoSize): array
		{
			$video = [];
			$videoStart = $this->position;
			while ($this->position < $videoStart + $videoSize) {
				$id = $this->readId();
				$size = $this->readSize();
				switch ($id) {
					case $this->ebmlIds['PixelWidth']:
						$video['width'] = $this->readInteger($size);
						break;
					case $this->ebmlIds['PixelHeight']:
						$video['height'] = $this->readInteger($size);
						break;
					default:
						$this->skipBytes($size);
				}
			}
			return $video;
		}

		/* reads variable length EBML id */
		private function readId(): ?int
		{
			try {
				$firstByte = $this->read(1, true);
				if ($firstByte === false) {
					throw new RuntimeException("Failed to read EBML id.");
				}
				$firstByte = unpack('C', $firstByte)[1];
				//read EBML ID length by checking the first 4 bits
				$length = 1;
				$mask = 0x80;
				while (($firstByte & $mask) === 0) {
					$mask >>= 1;
					$length++;
				}
				//check for invalid length
				if ($length < 1 || $length > 4) {
					throw new RuntimeException("Failed to read EBML id.");
				}
				//read the entire ID
				$idBytes = $this->read($length);
				if ($idBytes === false) {
					throw new RuntimeException("Failed to read EBML id.");
				}
				$id = unpack('N', str_pad($idBytes, 4, "\0", STR_PAD_LEFT))[1];
			} catch (Exception $e) {
				throw new RuntimeException("Failed to read EBML id.");
			}
			if ($this->debug) printf("Reading id: 0x%016X\n", $id);

			return $id;
		}

		/* reads variable length EBML data size */
		private function readSize(): ?int
		{
			try {
				$firstByte = $this->read(1);
				if ($firstByte === false) {
					throw new RuntimeException("Failed to read data size.");
				}
				$firstByte = unpack('C', $firstByte)[1];
				$length = 1;
				$mask = 0x80;
				while (($firstByte & $mask) === 0) {
					$mask >>= 1;
					$length++;
				}

				if ($length < 1 || $length > 8) {
					throw new RuntimeException("Failed to read data size.");
				}

				// Mask out the first bit from the first byte
				$mask = 0xFF - $mask; //flip the bits
				$firstByteValue = chr($firstByte & $mask);

				if ($length > 1) {
					$remainingBytes = $this->read($length - 1);
					if ($remainingBytes === false || strlen($remainingBytes) !== $length - 1) {
						throw new RuntimeException("Failed to read data size.");
					}
					$data = $firstByteValue . $remainingBytes;
				} else {
					$data = $firstByteValue;
				}

				$data = unpack('J', str_pad($data, 8, "\0", STR_PAD_LEFT))[1];
			} catch (Exception $e) {
				throw new RuntimeException("Failed to read data size.");
			}
			if ($this->debug) printf("Reading data length: 0x%016X\n", $data);
			return $data;
		}

		/* reads integer an converts to 64 bit unsigned int */
		private function readInteger($length = null): int
		{
			try {
				if ($length === null) {
					$length = $this->readSize();
				}
				$data = $this->read($length);
			} catch (Exception $e) {
				throw new RuntimeException("Failed to read integer.");
			}
			if ($data === false) {
				throw new RuntimeException("Failed to read integer.");
			}
			$int = unpack('J', str_pad($data, 8, "\0", STR_PAD_LEFT))[1];
			if ($this->debug) printf("Reading integer: %016X\n", $int);
			return $int;
		}

		/* reads float */
		private function readFloat($length = null): float
		{
			try {
				if ($length === null) {
					$length = $this->readSize();
				}
				$data = $this->read($length);
			} catch (Exception $e) {
				throw new RuntimeException("Failed to read float.");
			}
			if ($data === false) {
				throw new RuntimeException("Failed to read float.");
			}
			//floats in WEBM should always be 64 bit IEEE 754, and we need to force big endian here
			$float = unpack('E', $data)[1];

			if ($this->debug) printf("Reading float: %f\n", $float);
			return $float;
		}

		/* reads string */
		private function readString($length = null): string
		{
			try {
				if ($length === null) {
					$length = $this->readSize();
				}
				$data = $this->read($length);
			} catch (Exception $e) {
				throw new RuntimeException("Failed to read string.");
			}
			if ($data === false) {
				throw new RuntimeException("Failed to read string.");
			}
			if ($this->debug) printf("Reading string: %s\n", $data);
			return $data;
		}

		/**
		 * @throws Exception
		 */
		private function read($length, $leavePosition = false): ?string
		{
			if ($length <= 0) {
				return null;
			}
			if ($this->mediaLocation === 'database') {
				$query = "SELECT SUBSTR(`data`,?,?) FROM mediaFiles WHERE id = ?";
				$results = $this->db->fetchValue($query, [($this->position + 1), $length, $this->fileId]);
				if ($results['error'] || $results['rows'] < 1) {
					throw new Exception('Error reading from blob');
				}
				if (!$leavePosition) {
					//if leavePosition is false, the position should be updated
					$this->position += $length;
				}
				return $results['data'];
			} else {
				$buffer = fread($this->handle, $length);
				if (!$leavePosition) {
					//if leavePosition is false, the position should be updated
					$this->position = ftell($this->handle);
				} else {
					//if leavePosition is true, the position should be reset to the start of the buffer
					fseek($this->handle, $this->position);
				}
				return $buffer;
			}
		}

		private function seek($length, $whence = SEEK_SET): void
		{
			if ($this->mediaLocation === 'database') {
				if ($whence === SEEK_SET) {
					$this->position = $length;
				} elseif ($whence === SEEK_CUR) {
					$this->position += $length;
				}
			} else {
				fseek($this->handle, $length, $whence);
				$this->position = ftell($this->handle);
			}
		}

		private function tell(): int
		{
			return $this->position;
		}

		private function skipBytes($length): void
		{
			if ($length > 0) {
				$this->seek($length, SEEK_CUR);
			}
		}

		private function setTrack(): void
		{
			if ($this->track !== null) {
				$this->info['tracks'][$this->track['id']] = $this->track;
				if ($this->track['type'] === self::TRACK_TYPE_VIDEO) {
//					$this->info['width'] = $this->track['width'];
//					$this->info['height'] = $this->track['height'];
				}
				$this->track = null;
			}
		}

		/**
		 * @throws Exception
		 */
		private function verifyAssumption($condition, $message): void
		{
			if (!$condition) {
				throw new Exception($message);
			}
		}

		private function initializeIdTable(): void
		{

			$this->ebmlIds = [
				'EBML' => 0x1A45DFA3,
				'EBMLVersion' => 0x4286,
				'EBMLReadVersion' => 0x42F7,
				'EBMLMaxIDLength' => 0x42F2,
				'EBMLMaxSizeLength' => 0x42F3,
				'DocType' => 0x4282,
				'DocTypeVersion' => 0x4287,
				'DocTypeReadVersion' => 0x4285,
				'Segment' => 0x18538067,
				'SeekHead' => 0x114D9B74,
				'Seek' => 0x4DBB,
				'SeekID' => 0x53AB,
				'SeekPosition' => 0x53AC,
				'Info' => 0x1549A966,
				'TimestampScale' => 0x2AD7B1,
				'Duration' => 0x4489,
				'DateUTC' => 0x4461,
				'Title' => 0x7BA9,
				'Tracks' => 0x1654AE6B,
				'TrackEntry' => 0xAE,
				'TrackNumber' => 0xD7,
				'TrackUID' => 0x73C5,
				'TrackType' => 0x83,
				'Video' => 0xE0,
				'PixelWidth' => 0xB0,
				'PixelHeight' => 0xBA
			];
		}
	}